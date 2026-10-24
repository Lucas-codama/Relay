# Relay: comandos imediatos e saída direta

Autorizado pelo usuário: implementar /status, /details e /cancel durante a tarefa,
resumo final organizado e consumo por tarefa/conversa. Remover explicações de
engenharia da saída normal; manter diagnóstico e métricas completos sob demanda.
Limite atualizado: parar em 40% restante (60% usado), substituindo os 50%
restantes anteriores. Início desta entrega: conta com 50% usado. Janela semanal
exposta pela ferramenta da conta; sem porcentagem por chamada.

Aceitação: comandos respondem antes do fim da tarefa; cancelamento aguarda limpeza
antes de executar outra tarefa; /exit cancela e encerra, EOF esvazia a fila;
prompts são sequenciais com fila limitada; teclado/linha em edição não são apagados
pelo painel; resumo não despeja TAP nem repete avisos; testes parciais têm contagens
reais; cache/reaproveitamento e consumo permanecem distintos sem economia inventada.
Erros, tokens desconhecidos, cores/NO_COLOR e sanitização continuam corretos.

Arquivos: coordenador cuida de chat, contratos/engine/checker/CLI e integração;
worker terminal possui terminal-ui e seus testes; worker live possui live-status
e seus testes. Revisão independente somente leitura após integração. Checks locais,
sem inferência necessária, sem novas dependências, publicação ou mudança de contas.

## Conclusão

Aceitação implementada: comandos imediatos, fila/cancelamento/EOF, entrada TTY preservada, resumo compacto e consumo por tarefa/tentativa/conversa sem dupla contagem. Detalhes completos sob demanda; run/bench não sugerem comandos exclusivos do chat. Checks finais: 124 testes + tipos + manutenção; native 2/2. Revisão independente com achados resolvidos. Workers encerrados, sem processos de inferência ativos. Estado durável nos arquivos do projeto e relatórios privados existentes. Nenhuma aprovação pendente. O teto atualizado permanece 40% restante; não há motivo para gastar até atingi-lo.
