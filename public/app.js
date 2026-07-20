// State Management
const STATE = {
  db: {}, // Stores date string (YYYY-MM-DD) -> intake amount (ml)
  selectedDate: getLocalDateString(new Date()), // Active logging date
  currentMonth: new Date().getMonth(), // Month for calendar (0-11)
  currentYear: new Date().getFullYear(), // Year for calendar
  dailyTarget: 2500, // 2.5 Litres
  glassCapacity: 250, // 250 ml per glass
};

// Date-based calibrations
function getGlassCapacity(dateStr) {
  return dateStr < '2026-07-14' ? 120 : 250;
}

function getDailyTarget(dateStr) {
  return dateStr < '2026-07-14' ? 2000 : 2500;
}

// Quotes Database
const QUOTES = [
  'YOUR FUTURE SELF IS EITHER THANKING YOU OR FACEPALMING. DRINK THE WATER.',
  'DID YOU ACTUALLY MEASURE IT THIS TIME? OR IS THAT 250ML GLASS SECRETLY A BUCKET?',
  'HOW THE FUCK DID YOU MISTAKE A 250ML GLASS FOR 120ML? FUCKING NUTS!',
  'DEHYDRATION MAKES YOU CRANKY. DON\'T BE CRANKY, DRINK A GLASS!',
  'YOUR BRAIN IS 73% WATER. FUEL THOSE DENDRITES!',
  'REMEMBER THE "120 ML MYTH" ERA? YES, HYDRATION CHEAT CODE WAS ACTIVE.',
  '2.5 LITRES A DAY. NO MORE 120ML SHORTCUTS FOR YOU!',
  'WATER: THE ORIGINAL ENERGY DRINK.'
];
let currentQuoteIndex = 0;

// Three.js References
let glassScene, glassCamera, glassRenderer, glassMesh, waterMesh, glassGroup;
let bgScene, bgCamera, bgRenderer, bgDroplets = [];

// DOM Elements
const elWaterMl = document.getElementById('water-ml');
const elWaterGlasses = document.getElementById('water-glasses');
const elProgressBarFill = document.getElementById('progress-bar-fill');
const elProgressPercent = document.getElementById('progress-percent');
const elMotivationalQuote = document.getElementById('motivational-quote');
const elCalendarDaysGrid = document.getElementById('calendar-days-grid');
const elCalendarHeaderDays = document.getElementById('calendar-header-days');
const elMonthlyGridTitle = document.getElementById('monthly-grid-title');
const elCalendarYearLabel = document.getElementById('calendar-year-label');

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Safe Event Listener Helper
function safeAddListener(id, event, callback) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, callback);
  } else {
    console.warn(`Element with ID "${id}" not found.`);
  }
}

// Initialize App
async function initApp() {
  setupEventHandlers();
  await loadData();
  
  try {
    if (typeof THREE !== 'undefined') {
      initThreeJSBackground();
      initThreeJSGlass();
    } else {
      console.warn('Three.js library not loaded. 3D features are disabled.');
    }
  } catch (err) {
    console.error('Failed to initialize 3D graphics:', err);
  }

  updateUI();

  try {
    if (typeof THREE !== 'undefined' && (bgRenderer || glassRenderer)) {
      animate();
    }
  } catch (err) {
    console.error('Failed to start 3D animation loop:', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}


// Helper: Format Date as local YYYY-MM-DD
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Event Handlers
function setupEventHandlers() {
  // Add/Remove buttons (uses 1 and -1 multiplier, adjustWater handles capacity)
  safeAddListener('btn-add-glass', 'click', () => adjustWater(1));
  safeAddListener('btn-remove-glass', 'click', () => adjustWater(-1));

  // Next quote button
  safeAddListener('next-quote-btn', 'click', cycleQuote);

  // Reset today
  safeAddListener('reset-today-btn', 'click', () => {
    if (confirm('Are you sure you want to reset the intake for the selected day?')) {
      saveWater(STATE.selectedDate, 0);
    }
  });

  // Calendar Month Navigation
  safeAddListener('prev-month-btn', 'click', () => navigateMonth(-1));
  safeAddListener('next-month-btn', 'click', () => navigateMonth(1));
}

// Quote Carousel
function cycleQuote() {
  currentQuoteIndex = (currentQuoteIndex + 1) % QUOTES.length;
  elMotivationalQuote.innerHTML = `Welcome back KT, <span class="quote-highlight">"${QUOTES[currentQuoteIndex]}"</span>`;
}

// Seed historical water logs to prevent data loss
const INITIAL_WATER_DATA = {
  "2026-07-12": 1800,
  "2026-07-13": 2040,
  "2026-07-14": 2500,
  "2026-07-15": 2750,
  "2026-07-16": 2500,
  "2026-07-17": 3000,
  "2026-07-19": 1750
};

// API: Fetch Logs from LocalStorage
async function loadData() {
  try {
    const localData = localStorage.getItem('water_tracker_data');
    if (localData) {
      STATE.db = JSON.parse(localData);
    } else {
      STATE.db = INITIAL_WATER_DATA;
      localStorage.setItem('water_tracker_data', JSON.stringify(INITIAL_WATER_DATA));
    }
  } catch (err) {
    console.error('Error fetching water logs from local storage:', err);
    STATE.db = INITIAL_WATER_DATA;
  }
}

// API: Save Logs to LocalStorage
async function saveWater(dateString, newAmount) {
  try {
    STATE.db[dateString] = newAmount;
    localStorage.setItem('water_tracker_data', JSON.stringify(STATE.db));
    updateUI();
  } catch (err) {
    console.error('Error saving water log to local storage:', err);
  }
}

// Local adjustment of water logging
function adjustWater(multiplier) {
  const capacity = getGlassCapacity(STATE.selectedDate);
  const current = STATE.db[STATE.selectedDate] || 0;
  const target = Math.max(0, current + multiplier * capacity);
  saveWater(STATE.selectedDate, target);
}

// Navigation for Calendar
function navigateMonth(direction) {
  STATE.currentMonth += direction;
  if (STATE.currentMonth < 0) {
    STATE.currentMonth = 11;
    STATE.currentYear -= 1;
  } else if (STATE.currentMonth > 11) {
    STATE.currentMonth = 0;
    STATE.currentYear += 1;
  }
  updateCalendarGrid();
  renderMonthlyLineChart();
}

// Update UI Components
function updateUI() {
  const target = getDailyTarget(STATE.selectedDate);
  const capacity = getGlassCapacity(STATE.selectedDate);

  // Update stats labels
  const currentIntake = STATE.db[STATE.selectedDate] || 0;
  const glasses = (currentIntake / capacity).toFixed(1);
  const totalGlassesGoal = Math.ceil(target / capacity);

  if (elWaterMl) elWaterMl.textContent = `${currentIntake} / ${target}`;
  if (elWaterGlasses) elWaterGlasses.textContent = `${glasses} / ${totalGlassesGoal}`;

  // Fill Progress Bar
  const percent = Math.min(100, Math.round((currentIntake / target) * 100));
  if (elProgressBarFill) elProgressBarFill.style.width = `${percent}%`;
  if (elProgressPercent) elProgressPercent.textContent = `${percent}%`;

  // Update 3D Water scale
  update3DWater(currentIntake / target);

  // Update button labels dynamically
  const elBtnAdd = document.getElementById('btn-add-glass');
  const elBtnRemove = document.getElementById('btn-remove-glass');
  if (elBtnAdd) {
    elBtnAdd.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:8px;">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      DRINK GLASS (+${capacity}ml)
    `;
  }
  if (elBtnRemove) {
    elBtnRemove.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:8px;">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      REMOVE GLASS (-${capacity}ml)
    `;
  }

  // Update Stupidity Banner
  const elBanner = document.getElementById('stupidity-banner');
  if (elBanner) {
    if (STATE.selectedDate < '2026-07-14') {
      elBanner.style.display = 'block';
      elBanner.style.backgroundColor = 'var(--neon-orange)';
      elBanner.innerHTML = `⚠️ <b>STUPIDITY ERA (Pre-July 14):</b> Mistook 250ml glass for 120ml. You actually drank double! Hydration cheat code active.`;
    } else {
      elBanner.style.display = 'block';
      elBanner.style.backgroundColor = 'var(--neon-yellow)';
      elBanner.innerHTML = `✅ <b>VERIFIED ERA:</b> Glass calibrated to 250ml. Target 2.5L. Measured with actual science.`;
    }
  }

  // Update charts
  updateCalendarGrid();
  renderWeeklyChart();
  renderMonthlyLineChart();
}

// Create customized water droplet geometry
function createDropletGeometry() {
  const geometry = new THREE.SphereGeometry(1, 16, 16);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Pinch the upper half of the sphere and stretch it to make a droplet shape
    if (y > 0) {
      const pinchFactor = 1 - (y / 1.0);
      pos.setX(i, x * pinchFactor);
      pos.setZ(i, z * pinchFactor);
      pos.setY(i, y * 1.4); // Stretch upward
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Three.js Canvas 1: Background Floating 3D Objects
function initThreeJSBackground() {
  const canvas = document.getElementById('bg-droplets-canvas');
  const width = window.innerWidth;
  const height = window.innerHeight;

  bgScene = new THREE.Scene();
  bgCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  bgCamera.position.z = 25;

  bgRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  bgRenderer.setSize(width, height);
  bgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  bgScene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7);
  bgScene.add(dirLight);

  // Spawn droplets
  const dropletGeo = createDropletGeometry();
  const dropletMat = new THREE.MeshPhongMaterial({
    color: 0x00d2ff,
    transparent: true,
    opacity: 0.45,
    shininess: 90,
    specular: 0xffffff
  });

  const numDroplets = 12;
  for (let i = 0; i < numDroplets; i++) {
    const mesh = new THREE.Mesh(dropletGeo, dropletMat);
    
    // Random position across viewport
    mesh.position.set(
      (Math.random() - 0.5) * 35,
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 15
    );

    // Random scaling
    const scale = Math.random() * 0.6 + 0.4;
    mesh.scale.set(scale, scale, scale);

    // Random velocity
    mesh.userData = {
      speedY: Math.random() * 0.02 + 0.01,
      speedX: (Math.random() - 0.5) * 0.01,
      rotX: Math.random() * 0.01,
      rotY: Math.random() * 0.02
    };

    bgScene.add(mesh);
    bgDroplets.push(mesh);
  }

  // Handle Resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    bgCamera.aspect = w / h;
    bgCamera.updateProjectionMatrix();
    bgRenderer.setSize(w, h);
  });
}

// Three.js Canvas 2: Interactive 3D Water Glass
function initThreeJSGlass() {
  const container = document.querySelector('.canvas-container');
  const canvas = document.getElementById('glass-3d-canvas');
  const rect = container.getBoundingClientRect();

  glassScene = new THREE.Scene();
  glassCamera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
  glassCamera.position.set(0, 3, 10);
  glassCamera.lookAt(0, 0, 0);

  glassRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  glassRenderer.setSize(rect.width, rect.height);
  glassRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  glassScene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
  mainLight.position.set(5, 8, 5);
  glassScene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0x00d2ff, 0.3);
  fillLight.position.set(-5, -2, -5);
  glassScene.add(fillLight);

  // Group to rotate container
  glassGroup = new THREE.Group();
  glassScene.add(glassGroup);

  // 1. Transparent Glass Cylinder
  const glassGeo = new THREE.CylinderGeometry(1.6, 1.2, 4, 32, 1, true);
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    shininess: 100,
    specular: 0xffffff
  });
  const glassMeshObj = new THREE.Mesh(glassGeo, glassMat);
  glassGroup.add(glassMeshObj);

  // 2. Glass Base
  const baseGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 32);
  const baseMesh = new THREE.Mesh(baseGeo, glassMat);
  baseMesh.position.y = -2;
  glassGroup.add(baseMesh);

  // 3. Water Cylinder Inside
  const waterGeo = new THREE.CylinderGeometry(1.52, 1.15, 3.8, 32);
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x00a2ff,
    transparent: true,
    opacity: 0.7,
    shininess: 90,
    specular: 0xffffff
  });
  waterMesh = new THREE.Mesh(waterGeo, waterMat);
  // Position so scaling occurs from the bottom
  waterMesh.position.y = -1.9;
  glassGroup.add(waterMesh);

  // Interactive mouse dragging to rotate
  let isDragging = false;
  let prevMousePosition = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    prevMousePosition = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMousePosition.x;
    const deltaY = e.clientY - prevMousePosition.y;

    glassGroup.rotation.y += deltaX * 0.01;
    glassGroup.rotation.x += deltaY * 0.01;

    prevMousePosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch support for mobile
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      prevMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - prevMousePosition.x;
    const deltaY = e.touches[0].clientY - prevMousePosition.y;

    glassGroup.rotation.y += deltaX * 0.01;
    glassGroup.rotation.x += deltaY * 0.01;

    prevMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  canvas.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Observe container size adjustments
  const resizeObserver = new ResizeObserver((entries) => {
    if (typeof THREE === 'undefined' || !glassCamera || !glassRenderer) return;
    for (let entry of entries) {
      const { width, height } = entry.contentRect;
      glassCamera.aspect = width / height;
      glassCamera.updateProjectionMatrix();
      glassRenderer.setSize(width, height);
    }
  });
  resizeObserver.observe(container);
}

// Adjust 3D water cylinder height scale
function update3DWater(ratio) {
  if (!waterMesh) return;
  const clampedRatio = Math.max(0.001, Math.min(1.0, ratio));
  
  // Scale height of water cylinder
  waterMesh.scale.y = clampedRatio;
  
  // Shift position up so base stays anchored to cup floor
  // Original height is 3.8, original center is y = 0 relative to cup center
  // If ratio = 1, y = -1.9 (bottom) + 1.9 (half height) = 0.
  // If ratio = 0.5, y = -1.9 + (3.8 * 0.5) / 2 = -0.95.
  waterMesh.position.y = -1.9 + (3.8 * clampedRatio) / 2;
}

// Core Loop
function animate() {
  requestAnimationFrame(animate);

  // Rotate main 3D glass slowly (if not user dragging)
  if (glassGroup) {
    glassGroup.rotation.y += 0.005;
  }

  // Animate background floating droplets
  bgDroplets.forEach((drop) => {
    drop.position.y += drop.userData.speedY;
    drop.position.x += drop.userData.speedX;
    
    drop.rotation.x += drop.userData.rotX;
    drop.rotation.y += drop.userData.rotY;

    // Reset when drifting off-screen
    if (drop.position.y > 15) {
      drop.position.y = -15;
      drop.position.x = (Math.random() - 0.5) * 35;
    }
    if (drop.position.x > 25 || drop.position.x < -25) {
      drop.userData.speedX *= -1;
    }
  });

  // Render both scenes
  if (bgRenderer && bgScene && bgCamera) {
    bgRenderer.render(bgScene, bgCamera);
  }
  if (glassRenderer && glassScene && glassCamera) {
    glassRenderer.render(glassScene, glassCamera);
  }
}

// Render Weekly Bar Chart (Custom SVG neobrutalist style)
function renderWeeklyChart() {
  const container = document.getElementById('weekly-chart-container');
  container.innerHTML = ''; // Clear

  const chartW = container.clientWidth || 320;
  const chartH = 220;

  // Compute dates for the last 7 days (ending today)
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(d);
  }

  // Build SVG content
  let svgContent = `
    <svg class="comic-chart" viewBox="0 0 ${chartW} ${chartH}">
      <defs>
        <!-- Offset filter for shadows -->
        <filter id="shadow" x="-5%" y="-5%" width="120%" height="120%">
          <feDropShadow dx="3" dy="3" stdDeviation="0" flood-color="#000000" />
        </filter>
      </defs>
  `;

  // Draw grid lines
  const gridLines = 4;
  const selectedTarget = getDailyTarget(STATE.selectedDate);
  for (let i = 0; i <= gridLines; i++) {
    const y = 30 + (i / gridLines) * 140;
    const value = Math.round(selectedTarget * (1 - i / gridLines));
    svgContent += `
      <line x1="35" y1="${y}" x2="${chartW - 15}" y2="${y}" class="chart-grid-line" />
      <text x="5" y="${y + 4}" class="chart-text" style="font-size: 11px;">${value}ml</text>
    `;
  }

  // Draw bars
  const paddingLeft = 45;
  const paddingRight = 15;
  const drawWidth = chartW - paddingLeft - paddingRight;
  const barGap = 10;
  const numBars = 7;
  const barWidth = (drawWidth - barGap * (numBars - 1)) / numBars;

  last7Days.forEach((date, idx) => {
    const dateStr = getLocalDateString(date);
    const intake = STATE.db[dateStr] || 0;
    const dayLabel = WEEKDAY_NAMES[date.getDay()];

    const dayTarget = getDailyTarget(dateStr);
    const maxBarH = 140;
    const barHeight = Math.max(4, Math.min(maxBarH, (intake / dayTarget) * maxBarH));
    
    const x = paddingLeft + idx * (barWidth + barGap);
    const y = 170 - barHeight;

    const isToday = dateStr === getLocalDateString(new Date());
    const isSelected = dateStr === STATE.selectedDate;

    let barColor = 'var(--neon-yellow)';
    if (intake >= dayTarget) {
      barColor = 'var(--neon-green)';
    } else if (intake > 0) {
      barColor = 'var(--neon-blue)';
    }

    if (isSelected) {
      barColor = 'var(--neon-pink)';
    }

    // Shadow rect
    svgContent += `
      <rect x="${x + 3}" y="${y + 3}" width="${barWidth}" height="${barHeight}" fill="#000" rx="4" />
      <!-- Front rect -->
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" 
            fill="${barColor}" stroke="#000" stroke-width="2.5" rx="4"
            class="chart-bar" onclick="selectDate('${dateStr}')" style="cursor: pointer;">
        <title>${dateStr}: ${intake} ml</title>
      </rect>
      <!-- Label text -->
      <text x="${x + barWidth / 2}" y="195" text-anchor="middle" class="chart-text" 
            style="font-size: 11px; fill: ${isToday ? 'var(--neon-pink)' : '#000'}; font-weight: ${isToday ? '800' : 'normal'};">
        ${dayLabel}
      </text>
    `;
  });

  // Bottom baseline axis
  svgContent += `
    <line x1="35" y1="170" x2="${chartW - 10}" y2="170" stroke="#000" stroke-width="3" />
    </svg>
  `;

  container.innerHTML = svgContent;
}

// Render Monthly Calendar Grid
function updateCalendarGrid() {
  const year = STATE.currentYear;
  const month = STATE.currentMonth;

  // Header month label
  if (elMonthlyGridTitle) elMonthlyGridTitle.textContent = `${MONTH_NAMES[month]} BOARD`;
  if (elCalendarYearLabel) elCalendarYearLabel.textContent = year;

  // Render Weekday Labels (SUN, MON...)
  elCalendarHeaderDays.innerHTML = '';
  WEEKDAY_NAMES.forEach(day => {
    const dBox = document.createElement('div');
    dBox.textContent = day;
    elCalendarHeaderDays.appendChild(dBox);
  });

  // Calculate calendar info
  const firstDayIndex = new Date(year, month, 1).getDay();
  const numDays = new Date(year, month + 1, 0).getDate();

  elCalendarDaysGrid.innerHTML = '';

  // Padding cells before first day
  for (let i = 0; i < firstDayIndex; i++) {
    const pad = document.createElement('div');
    pad.className = 'calendar-day empty';
    elCalendarDaysGrid.appendChild(pad);
  }

  const todayStr = getLocalDateString(new Date());

  // Render calendar day cells
  for (let day = 1; day <= numDays; day++) {
    const dayDate = new Date(year, month, day);
    const dayStr = getLocalDateString(dayDate);
    const intake = STATE.db[dayStr] || 0;

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    
    // Style flags based on intake
    if (dayStr === todayStr) {
      cell.classList.add('day-today');
    }
    if (dayStr === STATE.selectedDate) {
      cell.style.borderColor = 'var(--neon-pink)';
      cell.style.borderWidth = '3.5px';
    }
    
    const dayTarget = getDailyTarget(dayStr);
    if (intake >= dayTarget) {
      cell.classList.add('day-target-met');
    } else if (intake > 0) {
      cell.classList.add('day-partial');
    }

    // Content: Day number
    const numSpan = document.createElement('span');
    numSpan.className = 'calendar-day-num';
    numSpan.textContent = day;
    cell.appendChild(numSpan);

    // Status box matching the pink checkboxes in the screenshot
    const statusBox = document.createElement('div');
    statusBox.className = 'calendar-day-status';

    if (intake >= dayTarget) {
      statusBox.innerHTML = '&#10003;'; // Checkmark
    } else if (intake > 0) {
      const pct = Math.round((intake / dayTarget) * 100);
      statusBox.textContent = `${pct}%`;
      statusBox.style.fontSize = '8px';
    }
    cell.appendChild(statusBox);

    // Interactivity
    cell.addEventListener('click', () => selectDate(dayStr));

    elCalendarDaysGrid.appendChild(cell);
  }
}

// Render Monthly Progress Line Chart (Custom SVG)
function renderMonthlyLineChart() {
  const container = document.getElementById('monthly-chart-container');
  container.innerHTML = '';

  const chartW = container.clientWidth || 320;
  const chartH = 220;

  const year = STATE.currentYear;
  const month = STATE.currentMonth;
  const numDays = new Date(year, month + 1, 0).getDate();

  // Create SVG string
  let svgContent = `
    <svg class="comic-chart" viewBox="0 0 ${chartW} ${chartH}">
      <defs>
        <!-- Pink Area Gradient -->
        <linearGradient id="pink-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--neon-pink)" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="var(--neon-pink)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
  `;

  // Draw grid lines
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = 30 + (i / gridLines) * 140;
    const value = Math.round(100 * (1 - i / gridLines));
    svgContent += `
      <line x1="30" y1="${y}" x2="${chartW - 15}" y2="${y}" class="chart-grid-line" />
      <text x="2" y="${y + 4}" class="chart-text" style="font-size: 10px;">${value}%</text>
    `;
  }

  // Draw X axis label days (1, 5, 10, 15, 20, 25, 30...)
  const labelIntervals = Math.max(2, Math.floor(numDays / 6));

  // Compute points
  const paddingLeft = 35;
  const paddingRight = 15;
  const drawWidth = chartW - paddingLeft - paddingRight;
  const maxH = 140;
  
  let points = [];
  for (let d = 1; d <= numDays; d++) {
    const dayDate = new Date(year, month, d);
    const dayStr = getLocalDateString(dayDate);
    const intake = STATE.db[dayStr] || 0;
    const dayTarget = getDailyTarget(dayStr);
    const pct = Math.min(1.0, intake / dayTarget);

    const x = paddingLeft + ((d - 1) / (numDays - 1)) * drawWidth;
    const y = 170 - pct * maxH;
    points.push({ x, y, day: d, dateStr: dayStr, intake });
  }

  // Path outline
  let pathD = '';
  let areaD = `M ${paddingLeft} 170 `;

  points.forEach((pt, idx) => {
    if (idx === 0) {
      pathD += `M ${pt.x} ${pt.y} `;
    } else {
      pathD += `L ${pt.x} ${pt.y} `;
    }
    areaD += `L ${pt.x} ${pt.y} `;
  });

  areaD += `L ${points[points.length - 1].x} 170 Z`;

  // Area under path
  svgContent += `<path d="${areaD}" class="chart-line-area" />`;

  // Outline path
  svgContent += `<path d="${pathD}" class="chart-line" />`;

  // Dots
  points.forEach((pt) => {
    const isToday = pt.dateStr === getLocalDateString(new Date());
    const isSelected = pt.dateStr === STATE.selectedDate;

    const dayTarget = getDailyTarget(pt.dateStr);
    let dotColor = 'var(--neon-yellow)';
    if (pt.intake >= dayTarget) {
      dotColor = 'var(--neon-green)';
    }

    if (isSelected) {
      dotColor = 'var(--neon-pink)';
    }

    // Add key day numbers at the bottom
    if (pt.day === 1 || pt.day % labelIntervals === 0 || pt.day === numDays) {
      svgContent += `
        <text x="${pt.x}" y="195" text-anchor="middle" class="chart-text" style="font-size: 10px;">${pt.day}</text>
      `;
    }

    // Dot mesh element
    svgContent += `
      <circle cx="${pt.x}" cy="${pt.y}" class="chart-dot" fill="${dotColor}" 
              onclick="selectDate('${pt.dateStr}')" style="cursor: pointer;">
        <title>Day ${pt.day}: ${pt.intake} ml</title>
      </circle>
    `;
  });

  // Base line
  svgContent += `
    <line x1="30" y1="170" x2="${chartW - 10}" y2="170" stroke="#000" stroke-width="3" />
    </svg>
  `;

  container.innerHTML = svgContent;
}

// Global hook to change active log day
window.selectDate = function(dateStr) {
  STATE.selectedDate = dateStr;
  
  // Set month/year if calendar navigated separately
  const parts = dateStr.split('-');
  const clickedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  STATE.currentMonth = clickedDate.getMonth();
  STATE.currentYear = clickedDate.getFullYear();

  updateUI();
};
