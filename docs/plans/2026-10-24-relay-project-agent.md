# Relay: entrega integrada de agente para projetos

Status: execução autorizada explicitamente pelo usuário em 2026-10-24, sem novas
rodadas de aprovação. Limite superior prioritário: parar quando a janela de uso
da conta atingir 50% usado (50% restante). Início observado: 39% usado/61% restante
na janela semanal; não há medição por chamada disponível. Coordenador consulta
limites entre blocos e interrompe recursos próprios ao atingir o limiar.

Objetivo: CLI conversacional com cores, trabalho em vários arquivos, classificação
local de complexidade, seleção automática de capacidade, contexto seletivo,
reuso de resultados idênticos, testes reais e reparo restrito ao que falhou.
Não prometer uma taxa de economia; comparar tokens totais por tarefa concluída,
incluindo falhas e coordenação, com a mesma tarefa diretamente no robusto.

Aceitação: criar um pequeno projeto executável; conversar para evoluí-lo; preservar
arquivos já corretos e dados do usuário; reparos não alteram o avaliador; instruções
do modelo são dados estruturados, nunca shell; backup/undo; cores com alternativa
sem ANSI; relatórios sem segredos; testes de roteamento, seleção de contexto,
cache, reparo, orçamento, caminhos e interação. Execução de testes novos exige
sandbox nativo com leitura restrita, rede bloqueada e ambiente sem credenciais.

Implementação: reutilizar login/App Server e código existente. Novos contratos
em project-types; arquivos/contexto/edições em workspace; seleção em router;
protocolo de alterações em project-model; coordenação em project-engine;
interface em terminal-ui/chat; validação e staging em project-sandbox.
Configuração, contratos compartilhados, CLI e integração pertencem ao coordenador.
Workers só recebem arquivos separados; revisão independente é somente leitura.

Nenhuma publicação, commit, push, ferramenta global, API com nova cobrança,
mudança de permissões de máquina ou automação. Autoriza uso da assinatura
existente para validar a entrega, limitado por medição real e parada acima.
Comportamentos não comprovados ficam descritos como limites, sem falsa conclusão.


## Estado de entrega e evidência

Implementação integrada concluída para JavaScript Node sem dependências. Projeto
real em examples/tarefas: cinco testes protegidos passaram; benchmark válido
8.602 versus 9.829 tokens, 12,48% menos nessa amostra; cache revalidado com zero
inferência. Não há garantia de economia geral, suporte universal a stacks ou
ótimo global de roteamento. Os gastos anteriores de integração estão em setup.

Checks: 90 testes + tipos + manutenção passaram; gates nativos e 13 self-tests
passaram. Revisão independente acompanhou correções. Recursos duráveis: código,
documentos, exemplo e estado privado Relay (backups, benchmark e relatórios).
Temporários pertencem a .local e Relay/checks/benchmarks com UUIDs; não são
processos de trabalho em segundo plano nem publicação. Workers encerrados após
revisão. Medição final 47% usado/53% restante; não gastar para atingir o limite.

Continuação futura, se solicitada: ampliar avaliadores independentes para outras
stacks e medir várias tarefas antes de qualquer promessa pública de economia.
Sem aprovação pendente para esta entrega; nenhuma publicação autorizada.
