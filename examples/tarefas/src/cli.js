import { readFile, writeFile } from 'node:fs/promises';
import { addTask, completeTask, listTasks } from './tasks.js';

const file = process.env.RELAY_TASKS_FILE || 'tasks.json';

async function loadTasks() {
  try {
    const data = await readFile(file, 'utf8');
    const tasks = JSON.parse(data);
    if (!Array.isArray(tasks)) throw new TypeError('O arquivo de tarefas deve conter um array JSON.');
    return tasks;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveTasks(tasks) {
  await writeFile(file, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8');
}

async function main(args) {
  const [command, ...values] = args;
  const tasks = await loadTasks();
  if (command === 'add') {
    const title = values.join(' ');
    const updated = addTask(tasks, title);
    await saveTasks(updated);
    console.log(`Adicionada #${updated.at(-1).id}: ${updated.at(-1).title}`);
  } else if (command === 'list') {
    const filter = values[0] || 'all';
    for (const task of listTasks(tasks, filter)) {
      console.log(`${task.done ? '[x]' : '[ ]'} #${task.id} ${task.title}`);
    }
  } else if (command === 'done') {
    if (values.length !== 1 || !/^\d+$/.test(values[0])) throw new TypeError('Uso: done <id>');
    await saveTasks(completeTask(tasks, Number(values[0])));
    console.log(`Tarefa #${values[0]} concluída.`);
  } else {
    throw new TypeError('Uso: add <título> | list [all|open|done] | done <id>');
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
