export function addTask(tasks, title) {
  if (typeof title !== 'string' || !title.trim()) {
    throw new TypeError('O título deve ser uma string não vazia.');
  }
  const nextId = tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;
  return [...tasks, { id: nextId, title: title.trim(), done: false }];
}

export function completeTask(tasks, id) {
  const numericId = Number(id);
  if (!tasks.some((task) => task.id === numericId)) {
    throw new RangeError(`Tarefa ${id} não encontrada.`);
  }
  return tasks.map((task) => task.id === numericId ? { ...task, done: true } : task);
}

export function listTasks(tasks, filter = 'all') {
  if (!['all', 'open', 'done'].includes(filter)) {
    throw new TypeError('Filtro inválido; use all, open ou done.');
  }
  return tasks.filter((task) => filter === 'all' || (filter === 'open' ? !task.done : task.done));
}
