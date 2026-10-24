# Design and accessibility

## Saída direta

Por decisão explícita do usuário, o padrão omite avisos didáticos, dumps TAP,
percentuais de contexto, raciocínio e caminhos privados de relatórios bem-sucedidos.
Resultado: cabeçalho, arquivos, testes com contagens reais, consumo tarefa/conversa,
tempo e próxima ação. Perguntas e respostas simples exibem só texto e consumo.
Falha não recebe rótulo Concluído; desconhecido não vira zero. /details preserva
informações completas; /usage mostra discriminação por tentativa/tarefa e reuso.

/status, /details, /usage e /cancel respondem durante execução. Ao começar a digitar,
o painel para de redesenhar, preservando a linha. TTY mantém cores e largura limitada;
NO_COLOR/pipes recebem eventos curtos deduplicados. Não há resumo final duplicado.
Mensagens antigas sobre o primeiro painel abaixo são histórico de implementação.


O painel ativo mostra etapa e relógio, com tokens aguardando até o provedor informar um snapshot. TTY redesenha uma linha dentro da largura disponível; eventos de rota mostram modelo/esforço. Sem ANSI, imprime snapshots alterados no máximo uma vez por segundo, além do resumo final. /status informa consumo da conversa. Cota mostra bucket, janela, saldo e renovação quando disponíveis; não substitui dados ausentes por zero. Fechar/reabrir a conversa carrega a nova versão.


## Interface atual — 2026-10-24

terminal-ui/chat implementam moldura verde, eventos em ciano, reparo amarelo e
falha vermelha, com rótulos independentes de cor. NO_COLOR desativa estilos; pipes
não recebem ANSI. Readline mantém controle de teclado no TTY. Texto do modelo
é limpo de controles/hiperlinks/bidi antes da apresentação. /help, /status, /undo,
/clear e /exit são locais; Ctrl+C cancela a tarefa e preserva a conversa.
EOF ou sinal externo encerram. Tokens desconhecidos e testes gerados têm avisos.
Testes verificam cores, largura, sanitização, comandos e cancelamento. Sem claim
de equivalência visual com Claude Code ou auditoria de leitor de tela.
O texto abaixo registra o histórico do primeiro protótipo.


The prototype has a terminal interface, without a web/desktop frontend or TUI
framework. Responsive layouts, components, tokens and visual browser checks are
inapplicable. The official authentication page opens in the system browser.

On 2026-10-24 the [prototype design](plans/2026-10-24-prototipo-relay-design.md)
specified Portuguese terminal messages, clear progress/error states,
color-independent output and Ctrl+C cancellation. cli/report and their local tests
now implement command validation, error exit codes and unavailable usage output;
controller/process tests cover interruption and termination behavior. Real CLI
and authentication evidence is recorded in setup.

This status follows [PRODUCT.md](../PRODUCT.md), verified on 2026-10-24. Revisit it
when a product flow requires an interface, and record the actual audience,
language, devices, UI source files, and interaction requirements then.

For a future web interface, define testable criteria for semantic structure,
keyboard navigation, visible focus, labels, contrast, reduced motion, and
empty/loading/error/success states. These are future review criteria, not
implemented features. Check the relevant local flow with synthetic data before
claiming accessibility or visual verification.

Documentation uses descriptive links, clear headings, and normal language. Keep
design values in their eventual component/token source instead of duplicating
them here. Adopting a skill does not choose a UI system or authorize deployment.
