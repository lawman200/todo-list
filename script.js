const STORAGE_KEY = 'todoflow.tasks';
const FILTERS = ['all', 'active', 'completed'];
const REMINDER_CHECK_MS = 15 * 1000;
const DEFAULT_REMINDER_MINUTES = 10;
const REMINDER_OPTIONS = {
  0: 0,
  5: 5 * 60 * 1000,
  10: 10 * 60 * 1000,
  15: 15 * 60 * 1000,
  30: 30 * 60 * 1000,
  60: 60 * 60 * 1000,
};

const todoForm = document.getElementById('todoForm');
const taskInput = document.getElementById('taskInput');
const reminderSelect = document.getElementById('reminderSelect');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const totalCount = document.getElementById('totalCount');
const activeCount = document.getElementById('activeCount');
const doneCount = document.getElementById('doneCount');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const filterButtons = [...document.querySelectorAll('.chip')];
const taskTemplate = document.getElementById('taskTemplate');
const toastContainer = document.getElementById('toastContainer');

let tasks = loadTasks();
let activeFilter = 'all';
let audioContext = null;

function ensureAudioContext() {
  if (!audioContext && window.AudioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playReminderTone() {
  ensureAudioContext();

  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;

  gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.15, audioContext.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.5);
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;

  const intervalMinutes = Number(task.reminderIntervalMinutes) || DEFAULT_REMINDER_MINUTES;
  const reminderIntervalMs = REMINDER_OPTIONS[intervalMinutes] ?? intervalMinutes * 60 * 1000;
  const nextReminderAt = task.completed || !task.reminderAt ? null : Number(task.reminderAt) || Date.now() + reminderIntervalMs;

  return {
    id: task.id || crypto.randomUUID(),
    text: String(task.text || '').trim(),
    completed: Boolean(task.completed),
    reminderIntervalMinutes: intervalMinutes,
    reminderAt: nextReminderAt,
  };
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return [
        { id: crypto.randomUUID(), text: 'Set up task board', completed: false, reminderIntervalMinutes: DEFAULT_REMINDER_MINUTES, reminderAt: Date.now() + REMINDER_OPTIONS[DEFAULT_REMINDER_MINUTES] },
        { id: crypto.randomUUID(), text: 'Review weekly goals', completed: true, reminderIntervalMinutes: DEFAULT_REMINDER_MINUTES, reminderAt: null },
        { id: crypto.randomUUID(), text: 'Plan next sprint', completed: false, reminderIntervalMinutes: DEFAULT_REMINDER_MINUTES, reminderAt: Date.now() + REMINDER_OPTIONS[DEFAULT_REMINDER_MINUTES] }
      ];
    }

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean) : [];
  } catch (error) {
    console.error('Unable to read saved tasks:', error);
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function getReminderDescription(task) {
  if (task.completed) return 'Completed';

  const interval = Number(task.reminderIntervalMinutes);
  if (!interval || !task.reminderAt) return 'No reminder';

  const ms = Math.max(task.reminderAt - Date.now(), 0);
  const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));

  if (minutes <= 0) {
    return `Reminder now • Every ${interval} min`;
  }

  return `Reminder in ${minutes} min • Every ${interval} min`;
}

function filterTasks() {
  return tasks.filter((task) => {
    if (activeFilter === 'active') return !task.completed;
    if (activeFilter === 'completed') return task.completed;
    return true;
  });
}

function updateSummary() {
  const total = tasks.length;
  const done = tasks.filter((task) => task.completed).length;
  const active = total - done;

  totalCount.textContent = total;
  activeCount.textContent = active;
  doneCount.textContent = done;
}

function renderTasks() {
  const visibleTasks = filterTasks();
  todoList.innerHTML = '';

  if (visibleTasks.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  visibleTasks.forEach((task) => {
    const fragment = taskTemplate.content.cloneNode(true);
    const item = fragment.querySelector('.todo-item');
    const checkbox = fragment.querySelector('.task-checkbox');
    const text = fragment.querySelector('.task-text');
    const meta = fragment.querySelector('.task-meta');
    const editButton = fragment.querySelector('.edit-button');
    const deleteButton = fragment.querySelector('.delete-button');

    item.dataset.id = task.id;
    checkbox.checked = task.completed;
    text.textContent = task.text;
    meta.textContent = getReminderDescription(task);

    if (task.completed) {
      item.classList.add('completed');
    }

    checkbox.addEventListener('change', () => {
      toggleTask(task.id);
    });

    editButton.addEventListener('click', () => {
      editTask(task.id);
    });

    deleteButton.addEventListener('click', () => {
      deleteTask(task.id);
    });

    todoList.appendChild(fragment);
  });
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return Promise.resolve('unsupported');
  }

  if (Notification.permission === 'granted') {
    return Promise.resolve('granted');
  }

  if (Notification.permission === 'denied') {
    return Promise.resolve('denied');
  }

  return Notification.requestPermission();
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function triggerReminder(task) {
  const reminderMessage = `Reminder: ${task.text}`;
  playReminderTone();

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Todo reminder', {
      body: task.text,
      tag: task.id,
    });
  } else {
    showToast(reminderMessage);
  }
}

function checkReminderSchedule() {
  let shouldPersist = false;

  tasks = tasks.map((task) => {
    if (task.completed || !task.reminderAt || Number(task.reminderIntervalMinutes) === 0) {
      return task;
    }

    if (Date.now() >= task.reminderAt) {
      shouldPersist = true;
      triggerReminder(task);
      const intervalMs = REMINDER_OPTIONS[Number(task.reminderIntervalMinutes)] ?? Number(task.reminderIntervalMinutes) * 60 * 1000;
      return { ...task, reminderAt: Date.now() + intervalMs };
    }

    return task;
  });

  if (shouldPersist) {
    saveTasks();
  }

  renderTasks();
}

function addTask(text) {
  const taskText = text.trim();
  if (taskText.length < 2) {
    taskInput.focus();
    taskInput.setAttribute('placeholder', 'Task must be at least 2 characters');
    return;
  }

  const reminderMinutes = Number(reminderSelect.value);
  const intervalMs = REMINDER_OPTIONS[reminderMinutes] ?? 0;

  tasks.unshift({
    id: crypto.randomUUID(),
    text: taskText,
    completed: false,
    reminderIntervalMinutes: reminderMinutes,
    reminderAt: reminderMinutes > 0 ? Date.now() + intervalMs : null,
  });

  requestNotificationPermission();
  saveTasks();
  updateSummary();
  renderTasks();
}

function toggleTask(id) {
  tasks = tasks.map((task) => {
    if (task.id !== id) return task;

    const completed = !task.completed;
    const intervalMinutes = Number(task.reminderIntervalMinutes) || DEFAULT_REMINDER_MINUTES;
    const intervalMs = REMINDER_OPTIONS[intervalMinutes] ?? intervalMinutes * 60 * 1000;

    return {
      ...task,
      completed,
      reminderAt: completed || intervalMinutes === 0 ? null : Date.now() + intervalMs,
    };
  });

  saveTasks();
  updateSummary();
  renderTasks();
}

function editTask(id) {
  const task = tasks.find((entry) => entry.id === id);
  if (!task) return;

  const nextText = window.prompt('Edit your task:', task.text);
  if (nextText === null) return;

  const trimmed = nextText.trim();
  if (trimmed.length < 2) {
    window.alert('Task cannot be blank or too short.');
    return;
  }

  const nextInterval = Number(
    window.prompt('Reminder every (minutes). Enter 0 for off, 5, 10, 15, 30, 60:', task.reminderIntervalMinutes || DEFAULT_REMINDER_MINUTES)
  );

  const safeInterval = [0, 5, 10, 15, 30, 60].includes(nextInterval) ? nextInterval : DEFAULT_REMINDER_MINUTES;
  const intervalMs = REMINDER_OPTIONS[safeInterval] ?? safeInterval * 60 * 1000;
  const nextReminderAt = task.completed || safeInterval === 0 ? null : Date.now() + intervalMs;

  tasks = tasks.map((entry) =>
    entry.id === id ? { ...entry, text: trimmed, reminderIntervalMinutes: safeInterval, reminderAt: nextReminderAt } : entry
  );

  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  updateSummary();
  renderTasks();
}

function deleteCompletedTasks() {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  updateSummary();
  renderTasks();
}

function clearAllTasks() {
  const confirmed = window.confirm('Delete every task in this list?');
  if (!confirmed) return;

  tasks = [];
  saveTasks();
  updateSummary();
  renderTasks();
}

function setFilter(filter) {
  activeFilter = FILTERS.includes(filter) ? filter : 'all';

  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  renderTasks();
}

todoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  ensureAudioContext();
  addTask(taskInput.value);
  taskInput.value = '';
  reminderSelect.value = '10';
  taskInput.setAttribute('placeholder', 'Add a new task...');
  taskInput.focus();
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter));
});

clearCompletedBtn.addEventListener('click', deleteCompletedTasks);
clearAllBtn.addEventListener('click', clearAllTasks);

requestNotificationPermission();
updateSummary();
renderTasks();
setInterval(checkReminderSchedule, REMINDER_CHECK_MS);
