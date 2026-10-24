# Gerenciador de tarefas

Aplicativo de terminal em JavaScript ESM, sem dependências. Requer Node.js.

```sh
npm start -- add "Comprar pão"
npm start -- list
npm start -- list open
npm start -- done 1
```

Os comandos `list` aceitam `all` (padrão), `open` ou `done`. As tarefas são armazenadas em `tasks.json` no diretório atual. Para escolher outro arquivo, defina `RELAY_TASKS_FILE`:

```sh
RELAY_TASKS_FILE=./dados/tarefas.json npm start -- add "Ler um livro"
```

Execute os testes com `npm test`.
