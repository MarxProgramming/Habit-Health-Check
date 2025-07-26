/*
 * Lifestyle Audit HQ
 *
 * This script drives a single‑page lifestyle audit application that
 * collects user habits over the past seven days, calculates penalty‑only
 * scores based on configurable bands, and presents an interactive
 * results report complete with a radar or grouped bar chart.  The app
 * loads its markers and thresholds from a JSON configuration so it
 * can easily be extended with new markers or regions without editing
 * this file.
 */

// Global variables for configuration and state
let config;
let markers;
let answers = {};
let currentIndex = 0;
let selectedRegion = 'uk';
let chartInstance = null;
let miniCharts = [];

// Selected demographics
let selectedAgeRange = '25-34';
let selectedGender = 'other';

const ageOptions = ['18-24', '25-34', '35-44', '45-54', '55+'];
const genderOptions = ['female', 'male', 'other'];

// Baseline adjustments by age group.  Each array corresponds to
// ageOptions: 18-24, 25-34, 35-44, 45-54, 55+
const ageBaselineMap = {
  alcohol: [14, 12, 10, 9, 8],
  nicotine: [8, 5, 3, 2, 1],
  caffeine: [180, 210, 200, 180, 160],
  sleep: [7, 7, 7, 7, 7],
  strength_training: [12, 10, 8, 6, 5],
  cardio: [20, 15, 10, 8, 6],
  social_media: [180, 150, 120, 90, 60],
  porn: [2, 1, 0.5, 0.3, 0.1],
  fast_food: [3, 2, 1, 1, 0.5],
  tooth_brushing: [2, 2, 2, 2, 2],
  sugary_drinks: [4, 3, 2, 2, 1],
  social_connections: [3, 3, 2, 2, 2],
  fruit_veg: [3, 4, 4, 4, 4]
};

// Gender adjustments added to baseline values
const genderAdjustments = {
  male: { alcohol: 2, nicotine: 2, caffeine: 10, sleep: -0.5, strength_training: 2, cardio: 0, social_media: -20, porn: 1, fast_food: 0.5, sugary_drinks: 1, social_connections: -0.5, fruit_veg: -0.5 },
  female: { alcohol: -2, nicotine: -2, caffeine: -10, sleep: 0.5, strength_training: -2, cardio: 0, social_media: 20, porn: -1, fast_food: -0.5, sugary_drinks: -1, social_connections: 0.5, fruit_veg: 0.5 },
  other: {}
};

function getBaselineFor(markerId) {
  const ageIndex = ageOptions.indexOf(selectedAgeRange);
  let base = (ageBaselineMap[markerId] && ageIndex >= 0) ? ageBaselineMap[markerId][ageIndex] : (config.regions[selectedRegion]?.baselines[markerId] ?? markers.find(m => m.id === markerId).baseline);
  const genderAdj = genderAdjustments[selectedGender] || {};
  if (genderAdj[markerId] != null) base += genderAdj[markerId];
  return Math.max(0, base);
}

// Predefined choice sets for each marker.  Choices make it easier to
// answer the survey on touch devices.  Each entry contains a label
// (displayed to the user) and a numeric value used for scoring.
const choiceSets = {
  alcohol: [
    { label: 'None', value: 0 },
    { label: 'Low (1–7)', value: 5 },
    { label: 'Moderate (8–14)', value: 11 },
    { label: 'High (15–21)', value: 18 },
    { label: 'Very high (22+)', value: 25 }
  ],
  nicotine: [
    { label: 'None', value: 0 },
    { label: 'Occasional (1–10)', value: 5 },
    { label: 'Regular (11–20)', value: 15 },
    { label: 'High (21–40)', value: 30 },
    { label: 'Very high (40+)', value: 45 }
  ],
  caffeine: [
    { label: 'None', value: 0 },
    { label: 'Low (1–200)', value: 100 },
    { label: 'Moderate (201–400)', value: 300 },
    { label: 'High (401–600)', value: 500 },
    { label: 'Very high (600+)', value: 700 }
  ],
  sleep: [
    { label: '<5 hours', value: 4 },
    { label: '5–6 hours', value: 5.5 },
    { label: '6–7 hours', value: 6.5 },
    { label: '7–9 hours', value: 8 },
    { label: '>9 hours', value: 10 }
  ],
  strength_training: [
    { label: 'None', value: 0 },
    { label: '1–10 min', value: 7 },
    { label: '10–20 min', value: 15 },
    { label: '20–30 min', value: 25 },
    { label: '30+ min', value: 35 }
  ],
  cardio: [
    { label: 'None', value: 0 },
    { label: '1–10 min', value: 7 },
    { label: '10–20 min', value: 15 },
    { label: '20–30 min', value: 25 },
    { label: '30+ min', value: 35 }
  ],
  social_media: [
    { label: '0–30 min', value: 15 },
    { label: '31–60 min', value: 45 },
    { label: '61–120 min', value: 90 },
    { label: '121–180 min', value: 150 },
    { label: '>180 min', value: 210 }
  ],
  porn: [
    { label: 'None', value: 0 },
    { label: '1 session', value: 1 },
    { label: '2–3 sessions', value: 2.5 },
    { label: '4–6 sessions', value: 5 },
    { label: '7+ sessions', value: 7 }
  ],
  fast_food: [
    { label: 'None', value: 0 },
    { label: '1 meal', value: 1 },
    { label: '2 meals', value: 2 },
    { label: '3–4 meals', value: 3.5 },
    { label: '5+ meals', value: 5 }
  ],
  tooth_brushing: [
    { label: '0', value: 0 },
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3+', value: 3 }
  ]
  ,
  sugary_drinks: [
    { label: 'None', value: 0 },
    { label: '1–2', value: 1.5 },
    { label: '3–5', value: 4 },
    { label: '6–8', value: 7 },
    { label: '9+', value: 9 }
  ],
  social_connections: [
    { label: 'None', value: 0 },
    { label: '1', value: 1 },
    { label: '2–3', value: 2.5 },
    { label: '4–5', value: 4.5 },
    { label: '6+', value: 6 }
  ],
  fruit_veg: [
    { label: '0', value: 0 },
    { label: '1–2', value: 1.5 },
    { label: '3–4', value: 3.5 },
    { label: '5–6', value: 5.5 },
    { label: '7+', value: 7 }
  ]
};

// Notes for each marker when values fall into risk bands.  These strings
// reference official guidance or studies and are shown when the user
// crosses important thresholds.  Citation numbers come from the
// default citation list.
const notes = {
  alcohol: {
    mild: 'Regularly exceeding 14 units can raise your risk of health problems',
    high: 'Consistently high alcohol intake has been linked to liver damage and other diseases'
  },
  nicotine: {
    mild: 'Any use of tobacco or nicotine is harmful and highly addictive',
    high: 'Heavy nicotine intake can cause significant cardiovascular and respiratory harm'
  },
  caffeine: {
    mild: 'More than 400 mg per day may lead to restlessness and anxiety',
    high: 'Extremely high caffeine intake can cause heart palpitations and sleep disturbance'
  },
  sleep: {
    mild: 'Sleeping less than 7 hours can impair cognitive function',
    high: 'Chronic sleep deprivation increases risk of obesity and heart disease'
  },
  strength_training: {
    mild: 'Less than 20 min of strength training daily provides limited benefit',
    high: 'Neglecting muscle strengthening may raise risk of musculoskeletal issues'
  },
  cardio: {
    mild: 'Below 22 minutes of cardio daily falls short of activity guidelines',
    high: 'Very little cardio can increase risk of cardiovascular disease'
  },
  social_media: {
    mild: 'More than about two hours daily is associated with poorer mental health',
    high: 'Excessive social media use doubles the risk of mental health problems'
  },
  porn: {
    mild: 'Higher pornography consumption is linked to increased anxiety and depression',
    high: 'Frequent porn sessions can correlate with stress and relationship issues'
  },
  fast_food: {
    mild: 'Fast‑food meals are high in fat, sugar and salt',
    high: 'Frequent fast food may contribute to obesity and heart disease'
  },
  tooth_brushing: {
    mild: 'Brushing less than twice daily leads to plaque build‑up',
    high: 'Poor oral hygiene can cause gum disease and tooth decay'
  }
  ,
  sugary_drinks: {
    mild: 'Too many sugary drinks can lead to weight gain and diabetes',
    high: 'High intake of sugary drinks increases risk of heart and liver problems'
  },
  social_connections: {
    mild: 'Low social contact may increase risks of illness and early death',
    high: 'Chronic loneliness significantly raises risk of mortality'
  },
  fruit_veg: {
    mild: 'Eating less than five portions reduces nutrient intake',
    high: 'Very low fruit and veg intake can increase risk of disease'
  }
};

const app = document.getElementById('app');

// Read configuration embedded in index.html.  The config JSON is
// stored in a script tag with id="config-data" so the app works
// without requiring a web server.  See index.html for details.
function readEmbeddedConfig() {
  const cfgEl = document.getElementById('config-data');
  if (!cfgEl) throw new Error('Config element not found');
  config = JSON.parse(cfgEl.textContent);
  markers = config.markers;
}

// Launch screen: simple hook line and begin button
function renderLaunch() {
  app.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'ledger card p-6 md:p-8 space-y-6 transition-transform duration-300';
  const title = document.createElement('h1');
  title.className = 'text-3xl md:text-4xl font-mono font-bold text-gray-800';
  title.textContent = 'Habit Health Check';
  const intro = document.createElement('p');
  intro.className = 'text-sm text-gray-700';
  intro.textContent = 'This quick check compares your everyday habits with trusted health guidelines and UK averages. Answer a few simple questions to see where you stand and how you can improve.';
  // Age range select
  const ageLabel = document.createElement('label');
  ageLabel.className = 'block text-sm text-gray-700 mt-4';
  ageLabel.textContent = 'Select your age range';
  const ageSelect = document.createElement('select');
  ageSelect.className = 'mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md';
  ageOptions.forEach((age) => {
    const opt = document.createElement('option');
    opt.value = age;
    opt.textContent = age;
    if (age === selectedAgeRange) opt.selected = true;
    ageSelect.appendChild(opt);
  });
  ageSelect.addEventListener('change', () => {
    selectedAgeRange = ageSelect.value;
  });
  // Gender select
  const genderLabel = document.createElement('label');
  genderLabel.className = 'block text-sm text-gray-700 mt-4';
  genderLabel.textContent = 'Select your gender';
  const genderSelect = document.createElement('select');
  genderSelect.className = 'mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md';
  genderOptions.forEach((gender) => {
    const opt = document.createElement('option');
    opt.value = gender;
    opt.textContent = gender.charAt(0).toUpperCase() + gender.slice(1);
    if (gender === selectedGender) opt.selected = true;
    genderSelect.appendChild(opt);
  });
  genderSelect.addEventListener('change', () => {
    selectedGender = genderSelect.value;
  });
  const btn = document.createElement('button');
  btn.className = 'button-primary mt-6';
  btn.textContent = 'Begin';
  btn.addEventListener('click', () => {
    answers = {};
    currentIndex = 0;
    renderQuestion();
  });
  container.appendChild(title);
  container.appendChild(intro);
  container.appendChild(ageLabel);
  container.appendChild(ageSelect);
  container.appendChild(genderLabel);
  container.appendChild(genderSelect);
  container.appendChild(btn);
  app.appendChild(container);
}

// Render a single survey question based on the current marker
function renderQuestion() {
  const marker = markers[currentIndex];
  app.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'ledger card p-6 md:p-8 space-y-4 transition-transform duration-300';

  // Progress bar
  const progressOuter = document.createElement('div');
  progressOuter.className = 'progress-outer';
  const progressInner = document.createElement('div');
  progressInner.className = 'progress-inner';
  const percent = (currentIndex / markers.length) * 100;
  progressInner.style.width = `${percent}%`;
  progressOuter.appendChild(progressInner);
  container.appendChild(progressOuter);

  // Step indicator
  const stepContainer = document.createElement('div');
  stepContainer.className = 'flex justify-center space-x-1 mt-2';
  markers.forEach((m, idx) => {
    const dot = document.createElement('div');
    dot.className = 'rounded-full';
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.backgroundColor = idx === currentIndex ? '#0ea5e9' : '#d1d5db';
    stepContainer.appendChild(dot);
  });
  container.appendChild(stepContainer);

  // Question title
  const title = document.createElement('h2');
  title.className = 'text-xl font-mono font-semibold text-gray-800 mt-4';
  title.textContent = `${currentIndex + 1}. ${marker.label}`;
  container.appendChild(title);

  // Choice buttons
  const choicesDiv = document.createElement('div');
  choicesDiv.className = 'mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2';
  const choices = choiceSets[marker.id] || [];
  let selectedValue = answers[marker.id] ?? null;
  choices.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full text-center border border-gray-300 rounded px-3 py-2 text-sm hover:bg-gray-100 transition-colors';
    btn.textContent = label;
    // highlight if selected
    function updateSelection() {
      if (answers[marker.id] === value) {
        btn.classList.add('bg-green-600', 'text-white', 'border-green-600');
      } else {
        btn.classList.remove('bg-green-600', 'text-white', 'border-green-600');
        btn.classList.add('bg-white');
      }
    }
    updateSelection();
    btn.addEventListener('click', () => {
      answers[marker.id] = value;
      // Update all buttons selection state
      Array.from(choicesDiv.children).forEach((child) => {
        child.classList.remove('bg-green-600', 'text-white', 'border-green-600');
        child.classList.add('bg-white');
      });
      btn.classList.add('bg-green-600', 'text-white', 'border-green-600');
    });
    choicesDiv.appendChild(btn);
  });
  container.appendChild(choicesDiv);

  // Custom numeric input
  const customDiv = document.createElement('div');
  customDiv.className = 'mt-4';
  const customLabel = document.createElement('label');
  customLabel.className = 'block text-sm text-gray-700 mb-1';
  customLabel.textContent = `Or enter custom value (${marker.unit})`;
  const customInput = document.createElement('input');
  customInput.type = 'number';
  customInput.step = 0.1;
  customInput.min = 0;
  customInput.className = 'w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-800';
  // Prepopulate with existing answer if not from choice
  const currentValue = answers[marker.id];
  if (currentValue != null && !choices.some(c => c.value === currentValue)) {
    customInput.value = currentValue;
  }
  customInput.addEventListener('input', () => {
    const v = parseFloat(customInput.value);
    if (!isNaN(v)) {
      answers[marker.id] = v;
      // Unhighlight all choice buttons when custom value used
      Array.from(choicesDiv.children).forEach((child) => {
        child.classList.remove('bg-green-600', 'text-white', 'border-green-600');
        child.classList.add('bg-white');
      });
    }
  });
  customDiv.appendChild(customLabel);
  customDiv.appendChild(customInput);
  container.appendChild(customDiv);

  // Navigation buttons
  const nav = document.createElement('div');
  nav.className = 'flex justify-between pt-6';
  if (currentIndex > 0) {
    const back = document.createElement('button');
    back.className = 'button-secondary';
    back.textContent = 'Back';
    back.addEventListener('click', () => {
      currentIndex--;
      renderQuestion();
    });
    nav.appendChild(back);
  } else {
    nav.appendChild(document.createElement('div'));
  }
  const next = document.createElement('button');
  next.className = 'button-primary';
  next.textContent = currentIndex < markers.length - 1 ? 'Next' : 'Finish';
  next.addEventListener('click', () => {
    // If no choice selected, default to first option value
    if (answers[marker.id] == null && choices.length > 0) {
      answers[marker.id] = choices[0].value;
    }
    if (currentIndex < markers.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      renderResults();
    }
  });
  nav.appendChild(next);
  container.appendChild(nav);
  app.appendChild(container);
}

// Calculate scores and prepare report details
function computeResults() {
  const deductions = [];
  let score = 100;
  const userValues = [];
  const groupAvgValues = [];
  const overallAvgValues = [];
  const labels = [];

  markers.forEach((marker) => {
    const value = answers[marker.id] ?? 0;
    const bands = marker.bands;
    const penalties = marker.penalties;
    let penalty = 0;
    let bandName = 'good';
    if (!marker.invert) {
      // Consumption markers: lower is better
      if (value > bands.high * 1.5) {
        penalty = penalties.high + 2;
        bandName = 'very bad';
      } else if (value > bands.high) {
        penalty = penalties.high;
        bandName = 'high';
      } else if (value > bands.moderate) {
        penalty = penalties.moderate;
        bandName = 'moderate';
      } else if (value > bands.mild) {
        penalty = penalties.mild;
        bandName = 'mild';
      } else if (value <= bands.mild * 0.5) {
        bandName = 'excellent';
      }
    } else {
      // Beneficial markers: higher is better
      if (value < bands.high * 0.5) {
        penalty = penalties.high + 2;
        bandName = 'very bad';
      } else if (value < bands.high) {
        penalty = penalties.high;
        bandName = 'high';
      } else if (value < bands.moderate) {
        penalty = penalties.moderate;
        bandName = 'moderate';
      } else if (value < bands.mild) {
        penalty = penalties.mild;
        bandName = 'mild';
      } else if (value >= bands.mild * 1.5) {
        bandName = 'excellent';
      }
    }
    if (penalty > 0) {
      score -= penalty;
      deductions.push({
        id: marker.id,
        label: marker.label,
        value,
        penalty,
        band: bandName,
        citation: marker.citation,
        description: marker.description
      });
    }
    // Chart data
    userValues.push(value);
    // Group baseline (age and gender adjusted)
    const groupBaseline = getBaselineFor(marker.id);
    groupAvgValues.push(groupBaseline);
    // Overall baseline (default region baseline)
    const overallBaseline = config.regions[selectedRegion]?.baselines[marker.id] ?? marker.baseline;
    overallAvgValues.push(overallBaseline);
    // shorten label for charts (first word or first segment before space/hyphen)
    const shortLabel = marker.label.split(/\s|\u2011|-/)[0];
    labels.push(shortLabel);
  });
  if (score < 0) score = 0;
  return {
    score,
    deductions,
    chartData: { labels, userValues, groupAvgValues, overallAvgValues }
  };
}

// Compute the expected score for someone with average behaviour in the selected age and gender group.
function computeGroupScore() {
  let total = 100;
  markers.forEach((marker) => {
    const value = getBaselineFor(marker.id);
    const bands = marker.bands;
    const penalties = marker.penalties;
    let bandName = 'good';
    let penalty = 0;
    if (!marker.invert) {
      if (value > bands.high * 1.5) {
        penalty = penalties.high + 2;
        bandName = 'very bad';
      } else if (value > bands.high) {
        penalty = penalties.high;
        bandName = 'high';
      } else if (value > bands.moderate) {
        penalty = penalties.moderate;
        bandName = 'moderate';
      } else if (value > bands.mild) {
        penalty = penalties.mild;
        bandName = 'mild';
      }
    } else {
      if (value < bands.high * 0.5) {
        penalty = penalties.high + 2;
        bandName = 'very bad';
      } else if (value < bands.high) {
        penalty = penalties.high;
        bandName = 'high';
      } else if (value < bands.moderate) {
        penalty = penalties.moderate;
        bandName = 'moderate';
      } else if (value < bands.mild) {
        penalty = penalties.mild;
        bandName = 'mild';
      }
    }
    total -= penalty;
  });
  return total < 0 ? 0 : Math.round(total);
}

// Compute score for overall baseline (general UK average) regardless of age or gender
function computeOverallScore() {
  let total = 100;
  markers.forEach((marker) => {
    const overallBaseline = config.regions[selectedRegion]?.baselines[marker.id] ?? marker.baseline;
    const bands = marker.bands;
    const penalties = marker.penalties;
    let penalty = 0;
    if (!marker.invert) {
      if (overallBaseline > bands.high * 1.5) {
        penalty = penalties.high + 2;
      } else if (overallBaseline > bands.high) {
        penalty = penalties.high;
      } else if (overallBaseline > bands.moderate) {
        penalty = penalties.moderate;
      } else if (overallBaseline > bands.mild) {
        penalty = penalties.mild;
      }
    } else {
      if (overallBaseline < bands.high * 0.5) {
        penalty = penalties.high + 2;
      } else if (overallBaseline < bands.high) {
        penalty = penalties.high;
      } else if (overallBaseline < bands.moderate) {
        penalty = penalties.moderate;
      } else if (overallBaseline < bands.mild) {
        penalty = penalties.mild;
      }
    }
    total -= penalty;
  });
  return total < 0 ? 0 : Math.round(total);
}

// Determine colour for headline score
function scoreColor(score) {
  if (score >= 90) return 'green';
  if (score >= 70) return 'amber';
  return 'red';
}

// Render results screen
function renderResults() {
  const { score, deductions, chartData } = computeResults();
  app.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'results-container';
  container.className = 'ledger card p-6 md:p-8 space-y-6';

  // Headline score with colored circle
  const colorName = scoreColor(score);
  let bgColor = 'bg-green-500';
  if (colorName === 'amber') bgColor = 'bg-yellow-500';
  if (colorName === 'red') bgColor = 'bg-red-500';
  const scoreCircle = document.createElement('div');
  scoreCircle.className = `rating-circle mx-auto flex items-center justify-center w-24 h-24 rounded-full text-white text-2xl font-bold ${bgColor}`;
  scoreCircle.textContent = `${score.toFixed(0)}/100`;
  container.appendChild(scoreCircle);
  const scoreLabel = document.createElement('p');
  scoreLabel.className = 'text-center text-sm text-gray-700 mt-2';
  scoreLabel.textContent = 'Overall habit score';
  container.appendChild(scoreLabel);

  // Show average group score
  const avgScoreValue = computeGroupScore();
  const groupP = document.createElement('p');
  groupP.className = 'text-center text-sm text-gray-500';
  groupP.textContent = `Average ${selectedGender} aged ${selectedAgeRange} would score about ${avgScoreValue}/100`;
  container.appendChild(groupP);

  // Overall average score circle and group average score circle
  const overallScoreValue = computeOverallScore();
  const circlesWrapper = document.createElement('div');
  circlesWrapper.className = 'flex justify-center gap-4 mt-2';
  function createSmallCircle(value, label) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col items-center';
    const circle = document.createElement('div');
    circle.className = 'rating-circle flex items-center justify-center w-16 h-16 rounded-full text-white text-lg font-bold bg-gray-400';
    circle.textContent = `${value}`;
    const lbl = document.createElement('span');
    lbl.className = 'mt-1 text-xs text-gray-600';
    lbl.textContent = label;
    wrapper.appendChild(circle);
    wrapper.appendChild(lbl);
    return wrapper;
  }
  circlesWrapper.appendChild(createSmallCircle(avgScoreValue, 'Group avg'));
  circlesWrapper.appendChild(createSmallCircle(overallScoreValue, 'Overall avg'));
  container.appendChild(circlesWrapper);

  // Trigger confetti for high scores
  if (score >= 90) {
    setTimeout(() => {
      triggerConfetti();
    }, 300);
  }

  // Deduction breakdown
  if (deductions.length > 0) {
    const list = document.createElement('ul');
    list.className = 'space-y-2';
    deductions.forEach((d) => {
      const li = document.createElement('li');
      li.className = 'text-sm text-gray-700 flex items-start';
      const citation = `[${d.citation}]`;
      li.innerHTML = `<span class="font-medium mr-1">•</span>${d.label}: ${d.band} penalty (${d.value} ${markers.find(m => m.id === d.id).unit}) -${d.penalty} <span class="text-blue-600 ml-1">${citation}</span>`;
      list.appendChild(li);
    });
    container.appendChild(list);
  } else {
    const p = document.createElement('p');
    p.className = 'text-sm text-gray-700';
    p.textContent = 'Great work! You incurred no penalties this week.';
    container.appendChild(p);
  }

  // Remove large chart and instead prepare container for mini charts
  const vizHeader = document.createElement('h3');
  vizHeader.className = 'text-xl font-mono font-semibold mt-6';
  vizHeader.textContent = 'Visualisations';
  container.appendChild(vizHeader);
  const miniContainer = document.createElement('div');
  miniContainer.id = 'miniChartsContainer';
  miniContainer.className = 'space-y-4 mt-2';
  container.appendChild(miniContainer);

  // Detailed breakdown section
  const detailsHeader = document.createElement('h3');
  detailsHeader.className = 'text-xl font-mono font-semibold mt-6';
  detailsHeader.textContent = 'Detailed breakdown';
  container.appendChild(detailsHeader);
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'overflow-x-auto';
  const table = document.createElement('table');
  table.className = 'min-w-full text-sm mt-2 border-collapse';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr class="border-b border-gray-200">
      <th class="text-left py-1 pr-2">Marker</th>
      <th class="text-left py-1 pr-2">You</th>
      <th class="text-left py-1 pr-2">Average</th>
      <th class="text-left py-1 pr-2">Band</th>
      <th class="text-left py-1 pr-2">Penalty</th>
      <th class="text-left py-1 pr-2">Status</th>
    </tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  markers.forEach((m) => {
    const val = answers[m.id] ?? 0;
    const avg = config.regions[selectedRegion]?.baselines[m.id] ?? m.baseline;
    let bandName = 'good';
    let pen = 0;
    if (!m.invert) {
      if (val > m.bands.high) { bandName = 'high'; pen = m.penalties.high; }
      else if (val > m.bands.moderate) { bandName = 'moderate'; pen = m.penalties.moderate; }
      else if (val > m.bands.mild) { bandName = 'mild'; pen = m.penalties.mild; }
    } else {
      if (val < m.bands.high) { bandName = 'high'; pen = m.penalties.high; }
      else if (val < m.bands.moderate) { bandName = 'moderate'; pen = m.penalties.moderate; }
      else if (val < m.bands.mild) { bandName = 'mild'; pen = m.penalties.mild; }
    }
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-100';
    // Determine icon based on band
    let icon = '';
    if (bandName === 'excellent') icon = '🌟';
    else if (bandName === 'good') icon = '✅';
    else if (bandName === 'mild' || bandName === 'moderate') icon = '⚠️';
    else if (bandName === 'high') icon = '❌';
    else if (bandName === 'very bad') icon = '💀';
    tr.innerHTML = `<td class="py-1 pr-2">${m.label}</td>
      <td class="py-1 pr-2">${val}</td>
      <td class="py-1 pr-2">${avg}</td>
      <td class="py-1 pr-2 capitalize">${bandName}</td>
      <td class="py-1 pr-2">${pen > 0 ? '-' + pen : '0'}</td>
      <td class="py-1 pr-2 text-lg">${icon}</td>`;
    tbody.appendChild(tr);
    // Add note row if there is a warning note
    let noteText = '';
    if (bandName === 'mild' && notes[m.id] && notes[m.id].mild) {
      noteText = notes[m.id].mild;
    } else if ((bandName === 'moderate' || bandName === 'high') && notes[m.id] && notes[m.id].high) {
      noteText = notes[m.id].high;
    }
    if (noteText) {
      const noteTr = document.createElement('tr');
      noteTr.className = 'border-b border-gray-100';
      noteTr.innerHTML = `<td class="py-1 pr-2 text-xs italic text-gray-500" colspan="6">${noteText}</td>`;
      tbody.appendChild(noteTr);
    }
  });
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);

  // Recommendations (top three actions)
  if (deductions.length > 0) {
    const actionsHeader = document.createElement('h3');
    actionsHeader.className = 'text-xl font-mono font-semibold mt-4';
    actionsHeader.textContent = 'Top actions for next week';
    container.appendChild(actionsHeader);
    const actionsList = document.createElement('ol');
    actionsList.className = 'list-decimal list-inside space-y-1 text-sm text-gray-700';
    // Sort deductions by penalty descending
    const sorted = [...deductions].sort((a, b) => b.penalty - a.penalty);
    sorted.slice(0, 3).forEach((d) => {
      const marker = markers.find(m => m.id === d.id);
      let recommendation;
      if (marker.invert) {
        recommendation = `Increase ${marker.label.toLowerCase()} to at least ${marker.bands.mild} ${marker.unit}`;
      } else {
        recommendation = `Reduce ${marker.label.toLowerCase()} to below ${marker.bands.mild} ${marker.unit}`;
      }
      const li = document.createElement('li');
      li.innerHTML = `${recommendation} for a potential gain of ${d.penalty} points <span class="text-blue-600 ml-1">[${marker.citation}]</span>`;
      actionsList.appendChild(li);
    });
    container.appendChild(actionsList);
  }

  // Controls: region select, download, restart
  const controls = document.createElement('div');
  controls.className = 'flex flex-wrap gap-4 mt-6';

  // Region selection (helper to swap baselines)
  const regionSelect = document.createElement('select');
  regionSelect.className = 'px-3 py-2 border border-gray-300 rounded-md text-sm';
  Object.keys(config.regions).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = config.regions[key].label;
    if (key === selectedRegion) opt.selected = true;
    regionSelect.appendChild(opt);
  });
  regionSelect.addEventListener('change', () => {
    selectedRegion = regionSelect.value;
    // Recompute results and re-render
    renderResults();
  });
  controls.appendChild(regionSelect);

  // Download PDF button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'button-primary text-sm';
  downloadBtn.textContent = 'Download PDF';
  downloadBtn.addEventListener('click', async () => {
    await downloadPDF(container);
  });
  controls.appendChild(downloadBtn);

  // Restart button
  const restartBtn = document.createElement('button');
  restartBtn.className = 'button-secondary text-sm';
  restartBtn.textContent = 'Restart';
  restartBtn.addEventListener('click', () => {
    renderLaunch();
  });
  controls.appendChild(restartBtn);

  // Sources button
  const sourcesBtn = document.createElement('button');
  sourcesBtn.className = 'button-secondary text-sm';
  sourcesBtn.textContent = 'View sources';
  controls.appendChild(sourcesBtn);

  // Dark mode toggle button
  const darkBtn = document.createElement('button');
  darkBtn.className = 'button-secondary text-sm';
  darkBtn.textContent = 'Toggle dark mode';
  darkBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });
  controls.appendChild(darkBtn);

  // Scoring details button
  const scoringBtn = document.createElement('button');
  scoringBtn.className = 'button-secondary text-sm';
  scoringBtn.textContent = 'How scoring works';
  controls.appendChild(scoringBtn);

  container.appendChild(controls);

  // Sources section hidden by default
  const sourcesSection = document.createElement('div');
  sourcesSection.id = 'sources-section';
  sourcesSection.className = 'hidden mt-4 text-sm text-gray-700 space-y-1';
  sourcesSection.innerHTML = `
    <p>[1] NHS alcohol 14-unit guideline</p>
    <p>[2] CDC/AHA nicotine review 2024</p>
    <p>[3] FDA caffeine 400-mg note</p>
    <p>[4] NHS 7–9-hour sleep guidance</p>
    <p>[5] WHO physical activity standard</p>
    <p>[6] US Surgeon General social-media advisory</p>
    <p>[7] Addictive Behaviours porn study 2025</p>
    <p>[8] Public Health England fast-food briefing</p>
    <p>[9] NHS dental brushing advice</p>
    <p>[10] NHS five-a-day fruit and veg guidance</p>
    <p>[11] CDC facts on sugar-sweetened beverages</p>
    <p>[12] Harvard social connection and longevity article</p>
  `;
  container.appendChild(sourcesSection);
  // Toggle sources display
  sourcesBtn.addEventListener('click', () => {
    sourcesSection.classList.toggle('hidden');
  });

  // Scoring details section
  const scoringSection = document.createElement('div');
  scoringSection.id = 'scoring-section';
  scoringSection.className = 'hidden mt-4 text-sm text-gray-700 space-y-1';
  scoringSection.innerHTML = `
    <p>The score starts at 100 points. For each marker, points are subtracted when your value falls outside the recommended band.</p>
    <p><strong>Mild:</strong> -2 points. Your habit is slightly off the recommended range.</p>
    <p><strong>Moderate:</strong> -5 points. Your habit is moderately unhealthy or insufficient.</p>
    <p><strong>High:</strong> -8 points. Your habit is well outside the healthy range.</p>
    <p><strong>Very bad:</strong> -10 points. Your habit is far beyond harmful thresholds and merits urgent attention.</p>
    <p><strong>Excellent:</strong> 0 points deducted. Your habit is notably better than the guideline.</p>
  `;
  container.appendChild(scoringSection);
  scoringBtn.addEventListener('click', () => {
    scoringSection.classList.toggle('hidden');
  });
  app.appendChild(container);

  // Render mini charts after DOM is ready
  setTimeout(() => {
    drawMiniCharts(chartData);
  }, 0);
}

// Draw Chart.js radar or bar chart depending on viewport width
function drawChart({ labels, userValues, avgValues, mildValues, highValues }) {
  const ctx = document.getElementById('resultsChart');
  // Destroy previous chart if exists
  if (chartInstance) {
    chartInstance.destroy();
  }
  // Use a horizontal bar chart for an intuitive comparison
  const type = 'bar';
  // Configure datasets
  const datasets = [
    {
      label: 'You',
      data: userValues,
      backgroundColor: 'rgba(16, 185, 129, 0.6)',
      borderColor: 'rgba(16, 185, 129, 1)',
      borderWidth: 1,
      borderRadius: 4
    },
    {
      label: 'UK average',
      data: avgValues,
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
      borderRadius: 4
    },
    {
      label: 'Mild band',
      data: mildValues,
      backgroundColor: 'rgba(234, 179, 8, 0.4)',
      borderColor: 'rgba(234, 179, 8, 1)',
      borderWidth: 1,
      borderDash: [4, 4],
      borderRadius: 4
    },
    {
      label: 'High band',
      data: highValues,
      backgroundColor: 'rgba(239, 68, 68, 0.4)',
      borderColor: 'rgba(239, 68, 68, 1)',
      borderWidth: 1,
      borderDash: [4, 4],
      borderRadius: 4
    }
  ];
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Lifestyle markers comparison' }
    },
    scales: {
      x: { beginAtZero: true },
      y: { ticks: { autoSkip: false } }
    }
  };
  chartInstance = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options
  });
  // Redraw on resize
  window.onresize = () => {
    drawChart({ labels, userValues, avgValues, mildValues, highValues });
  };
}

// Draw separate mini bar charts for each marker.  Each chart
// visualises your value, the regional average and the mild/high
// thresholds to make differences obvious.  This function clears
// existing mini charts before creating new ones.
function drawMiniCharts({ labels, userValues, groupAvgValues, overallAvgValues }) {
  // Destroy previous mini charts
  if (miniCharts.length > 0) {
    miniCharts.forEach((ch) => ch.destroy());
    miniCharts = [];
  }
  const container = document.getElementById('miniChartsContainer');
  if (!container) return;
  container.innerHTML = '';
  markers.forEach((marker, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'h-32 p-2 rounded-lg shadow-sm';
    const canvas = document.createElement('canvas');
    canvas.id = 'mini_' + marker.id;
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    const data = {
      labels: ['You', 'Your group', 'Overall avg'],
      datasets: [
        {
          label: marker.label,
          data: [userValues[idx], groupAvgValues[idx], overallAvgValues[idx]],
          backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(96, 165, 250, 0.6)', 'rgba(156, 163, 175, 0.6)'],
          borderColor: ['rgba(16, 185, 129, 1)', 'rgba(96, 165, 250, 1)', 'rgba(156, 163, 175, 1)'],
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    };
    const options = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: marker.label, font: { size: 12 } }
      },
      scales: {
        x: { beginAtZero: true },
        y: { ticks: { autoSkip: false } }
      }
    };
    const miniChart = new Chart(canvas, { type: 'bar', data, options });
    miniCharts.push(miniChart);
  });
}

// Confetti animation for celebratory scores
function triggerConfetti() {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);
  const colors = ['#a5b4fc', '#fca5a5', '#fcd34d', '#6ee7b7', '#93c5fd'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.style.position = 'absolute';
    piece.style.width = '8px';
    piece.style.height = '12px';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = Math.random() * 100 + '%';
    piece.style.top = '-20px';
    piece.style.opacity = '0.8';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    const duration = 2 + Math.random() * 3;
    piece.style.animation = `fall ${duration}s linear forwards`;
    container.appendChild(piece);
  }
  setTimeout(() => {
    container.remove();
  }, 6000);
}

// Export results section as PDF
async function downloadPDF(container) {
  // Use html2canvas to capture the container
  const canvas = await html2canvas(container, { scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jspdf.jsPDF('p', 'pt', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  // Calculate dimensions to fit PDF
  const ratio = canvas.width / canvas.height;
  let pdfWidth = pageWidth - 40;
  let pdfHeight = pdfWidth / ratio;
  if (pdfHeight > pageHeight - 40) {
    pdfHeight = pageHeight - 40;
    pdfWidth = pdfHeight * ratio;
  }
  pdf.addImage(imgData, 'PNG', 20, 20, pdfWidth, pdfHeight);
  pdf.save('lifestyle-audit-report.pdf');
}

// Initialise app on load
document.addEventListener('DOMContentLoaded', () => {
  // Load configuration from embedded script tag
  readEmbeddedConfig();
  renderLaunch();
});