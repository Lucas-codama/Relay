# Relay

## Uso diário

Na conversa, use os comandos mesmo durante uma tarefa:

- /status: etapa, modelo, tempo e fila.
- /usage: consumo da tarefa, tentativas e conversa; tarefas reaproveitadas.
- /details: diagnóstico completo da tarefa atual ou da última.
- /cancel: cancelar a tarefa atual e aguardar seu encerramento.
- /undo: desfazer a última alteração, quando não há tarefa ativa.
- /exit: cancelar a execução atual, descartar a fila e sair.

O resumo padrão mostra resultado, arquivos, testes, tokens, tempo e próximo comando.
Não despeja logs ou explicações internas. Respostas e perguntas têm saída curta.
Pedidos adicionais entram numa fila de até oito; EOF termina os pedidos já aceitos.
O painel pausa enquanto você digita para preservar a linha em edição. Histórico
de consumo da conversa dura enquanto ela está aberta; /usage lista até 20 tarefas.

Em run/bench, --details exibe informações completas. Falhas indicam o relatório
local salvo; não é necessário repetir a tarefa para ler esse arquivo. Para carregar
esta atualização, termine a tarefa atual, saia com /exit e abra o Relay novamente.


O painel de execução mostra etapa, tempo decorrido, tentativa e tokens recebidos do Codex; o modelo aparece no evento de rota. /status também informa tokens da conversa. A cota compartilhada aparece somente quando o App Server a fornece, com janela e renovação; caso contrário, fica indisponível. Tokens podem chegar apenas no fim do turno. Atualização visual não chama IA. Reinicie o Relay após recompilar para carregar mudanças.


Agente de programação conversacional no terminal com seleção automática de
capacidade, edição de arquivos e verificação. Usa login oficial e a assinatura
Codex existente. Sucesso em verde, falha em vermelho e reparo em amarelo.

## Executar

Windows com MXC, Node 24.18.0 da linha 24, npm, PowerShell 7+ e Codex CLI
0.164.0-alpha.11.1. Sem instalação global. Nesta máquina login e perfis já existem.

```powershell
npm ci --ignore-scripts
npm run build
.\relay.cmd login
.\relay.cmd configure
.\relay.cmd chat --project examples/tarefas
```

configure escolhe uma vez os perfis econômico e robusto pelo catálogo. Depois,
o Relay escolhe a capacidade sozinho. Na conversa: /help, /status, /undo,
/clear, /exit. Ctrl+C cancela a tarefa ativa e mantém o chat. Pipes ou NO_COLOR
desativam estilos. O histórico enviado é resumido.

```powershell
node dist/src/cli.js run "Crie um projeto Node ESM com testes e README" --project meu-projeto
node dist/src/cli.js bench "Implemente a mudança preservando os testes" --project meu-projeto --max-turns 3
```

run aplica arquivos com backup. bench usa duas cópias privadas iguais e preserva
o original: compara a estratégia adaptativa com uma chamada direta no robusto.
O padrão permite até cinco chamadas por tarefa, incluindo leituras adicionais.
O comando demo preserva o experimento antigo; --help lista as opções.

O inicializador relay.cmd funciona no Windows PowerShell existente e localiza
PowerShell 7/Codex já instalados pelo app quando faltam no PATH. Só ajusta o
ambiente do processo. Node é reutilizado de Program Files/nodejs. Não instala
componentes nem altera o PATH do Windows. relay.ps1 usa a mesma inicialização.

## Economia e limites

A classificação local não usa IA. Contexto selecionado, cache revalidado por testes
e reparo restrito evitam trabalho desnecessário. Erros de implementação podem subir
o esforço e depois o modelo. Falhas de acesso ou ambiente não geram escalada.
Isso pode economizar, mas não garante economia: modelos menores também podem
gastar mais tokens ou exigir reparos. bench só conclui quando as duas execuções
passam nos mesmos testes protegidos e informam métricas reais. Não há conversão
comprovada entre tokens e cota da assinatura. Consulte [evidências](docs/setup.md).

O verificador integrado executa JavaScript Node sem dependências, com node:test,
em cópia MXC sem credenciais, rede ou escrita no projeto. Outros stacks ainda
não têm aprovação funcional integrada. Testes criados pela IA recebem aviso de
que os requisitos exigem revisão. O modelo não executa shell nem instala pacotes.
Backups, perfis e relatórios ficam em %LOCALAPPDATA%/Relay; MSIX pode virtualizar
esse caminho. /undo desfaz o último lote sem sobrepor mudanças externas.

## Verificar e entender

```powershell
npm run check
npm run test:native
npm run doctor
pwsh -NoProfile -File scripts/check-self-test.ps1
```

Leia [produto](PRODUCT.md), [arquitetura](docs/architecture.md),
[onboarding](docs/onboarding.md), [design](docs/design.md),
[qualidade](docs/quality.md), [instruções](AGENTS.md) e
[atribuição](THIRD_PARTY_NOTICES.md). Sem publicação ou push automático.
