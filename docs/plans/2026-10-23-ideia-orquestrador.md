# Relay: agente de terminal com roteamento adaptativo

Status: brainstorming, sem arquitetura aprovada ou implementação autorizada.
Fonte: ideia apresentada pelo usuário em 2026-10-23. Este registro preserva
hipóteses de produto. A base de uso e a interface foram escolhidas abaixo;
stack e arquitetura de implementação continuam em aberto.

Atualização de 2026-10-24: o usuário autorizou elaborar o desenho do protótipo.
O [desenho e os critérios de aceitação](2026-10-24-prototipo-relay-design.md)
sucedem as hipóteses deste registro e foram aprovados pelo usuário. O
[plano de implementação](2026-10-24-prototipo-relay-plan.md) aguarda sua própria
aprovação. O experimento ao vivo ainda não foi executado.

Nome confirmado pelo usuário em 2026-10-23: **Relay**. O nome JARVIS era
provisório; o caminho da pasta existente e os registros históricos da preparação
foram preservados. Disponibilidade de nome em registros e serviços não verificada.

## Intenção apresentada

Criar uma ferramenta de terminal para desenvolvimento assistido por IA. A pessoa
envia um pedido normal; o sistema distribui o trabalho entre agentes/modelos e
níveis de raciocínio, valida o resultado, integra as partes e aumenta a capacidade
quando necessário. A escolha ocorre automaticamente, sem pedir confirmação a
cada troca. O usuário considera divulgar o projeto publicamente; nenhuma
publicação está autorizada nesta etapa.

O objetivo é reduzir consumo desperdiçado mantendo qualidade verificável. Não há
percentual de economia demonstrado, público-alvo validado ou garantia de adoção.

## Fluxo candidato

1. Entender o pedido e critérios de conclusão; consultar apenas contexto relevante.
2. Classificar escopo, risco, dependências e capacidade necessária.
3. Escolher modelo e esforço dentro de uma política previamente configurada.
4. Executar diretamente tarefas simples; dividir apenas quando houver benefício.
5. Validar com testes/comandos e critérios de comportamento apropriados.
6. Diferenciar falha de implementação, falta de contexto, falha de ambiente e
   requisito ambíguo; não tratar qualquer erro como necessidade de modelo maior.
7. Escalar trabalho ainda não resolvido, levando diagnóstico, diff e contexto
   mínimo. Problemas sensíveis podem começar diretamente em maior capacidade.
8. Integrar, verificar o conjunto e mostrar resultado, decisões e consumo observado.

Modelos menores são candidatos para trabalho delimitado, não uma primeira etapa
obrigatória. Quantidade de agentes, esforço de raciocínio e modelo são controles
distintos. Execução paralela depende de tarefas independentes e arquivos/recursos
isolados. Testes passando fornecem evidência limitada, não prova de correção total.

## Hipóteses para o primeiro experimento

- Um único backend reduz complexidade inicial; suporte a outros pode vir depois.
- Um executor simples, um roteador e uma validação explícita bastam para testar
  o valor antes de criar uma equipe fixa de agentes ou interface sofisticada.
- Modelos disponíveis devem ser descobertos; não fixar nomes comerciais como
  níveis permanentes do produto.
- Modelos elegíveis, limites de tentativas, tempo e gasto/uso são definidos uma
  vez. As trocas dentro da política são automáticas. Isso não amplia permissões
  para arquivos, comandos, serviços, publicação ou cobrança fora da política.
- O objetivo experimental é custo ou consumo por tarefa aceita, comparado com
  um modelo de referência sob as mesmas condições; medir também conclusão,
  regressões, tempo, escaladas, tokens e revisão quando observáveis.
- Não prometer economia monetária a partir de tokens apenas. Planos de assinatura
  e APIs possuem mecanismos de uso/cobrança distintos; o sistema deve mostrar
  somente medidas disponíveis e identificar estimativas.

Possível MVP a discutir: terminal local, um backend, duas ou três faixas de
capacidade configuráveis, execução inicialmente serial, validação de projetos
com checks existentes, escalada limitada e um resumo auditável de execução.
Ainda não aprovado como escopo de implementação.

## Referências atuais e o que demonstram

Consultadas em 2026-10-23; esta pesquisa é uma amostra, não levantamento exaustivo.

- [Aider: modos de conversa](https://aider.chat/docs/usage/modes.html): separa
  arquiteto e editor; a própria documentação observa que duas chamadas podem
  aumentar tempo e custo. Não demonstra esta proposta completa.
- [OpenRouter: Auto Router](https://openrouter.ai/docs/guides/routing/routers/auto-router):
  seleção automática de modelo por pedido. A proposta de integração com validação
  de código, recuperação e escalada é uma hipótese de diferenciação a comparar.
- [Codex: subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents):
  suporta configuração de modelo e esforço diferentes por agente.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server): integração para
  produto próprio, sessões e eventos; model/list descobre modelos/esforços
  disponíveis por conta/cliente. Viabilidade de um adaptador deve ser comprovada
  em um experimento posterior, sem alterar autenticação ou faturamento agora.
- [Claude: Agent SDK e planos](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan):
  descreve opções atuais de uso e créditos. Não assumir que distribuição pública,
  autenticação e medição são idênticas às do Codex; verificar o caminho escolhido.

## Decisão confirmada: assinatura Codex e terminal

O usuário escolheu aproveitar a assinatura que a pessoa já possui para usar o
Codex, com autenticação oficial, em uma ferramenta interativa própria de terminal.
Não haverá frontend web/desktop no escopo inicial. Uma etapa de login oficial
no navegador é compatível com isso; o trabalho cotidiano ocorre no terminal.
Não foi pedido um cadastro próprio do Relay ou um servidor que concentre contas.

Hipótese de integração: Relay local conversa com Codex app-server por stdio;
o orquestrador controla classificação, contexto, execução, verificação e escalada.
A documentação oficial expõe autenticação, sessões, eventos, catálogo e limites.
O comando local `codex app-server --help` existe, mas o recurso é experimental;
nenhum login, modelo ou execução de inferência foi testado para este produto.

As referências oficiais atuais recomendam Sign in with ChatGPT para novas
integrações e documentam uso do app-server com token autorizado para o plano:

- [Autenticação e integração do App Server](https://learn.chatgpt.com/docs/app-server)
- [Sign in with ChatGPT com Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)

O primeiro experimento deverá verificar fluxo de login suportado para um cliente
local aberto, sessão, acesso real a dois modelos/esforços elegíveis e observação
de uso. O catálogo sozinho não comprova direito de acesso a cada modelo. Dados
de cota podem ser agregados/compartilhados; não permitem atribuir economia exata
a uma tarefa sem evidência adicional. Regras de distribuição/autenticação e
compatibilidade com a versão instalada precisam ser confirmadas antes do release.
Essas são verificações de viabilidade, não integrações já implementadas.

## Próxima decisão em aberto

Qual o público inicial: pessoas que já usam Codex e querem aproveitar melhor a
assinatura, ou pessoas iniciantes que precisam também de orientação para trabalhar
no projeto? Isso afeta o onboarding, a transparência e as mensagens do terminal.

Depois: definir uma tarefa demonstrável e critérios de sucesso, comparar
alternativas de arquitetura e apresentar um desenho para aprovação antes da
implementação. O objetivo de seleção automática permanece: modelos e limites
configurados uma vez, sem confirmação por troca dentro da política permitida.
