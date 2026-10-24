# Relay: escopo do produto

## Diagnóstico de acesso

Falhas estruturadas distinguem limite de uso, taxa de solicitações, sessão e acesso ao modelo. Sem dados do provedor, o Relay não afirma esgotamento. O limite global da conta não substitui o limite por aplicativo. /usage e falhas de limite indicam o gerenciamento oficial. Sessão próxima da expiração é renovada antes da síntese, na mesma conta.


## Experiência atual

O usuário autorizou implementar comandos imediatos, resumo organizado e consumo
por tarefa/conversa com saída simples. /status, /details, /usage e /cancel funcionam
durante a tarefa sem inferência adicional. Informações técnicas permanecem nos
detalhes e nos relatórios; o padrão mostra somente resultado e dados úteis.
[Plano e aceitação](docs/plans/2026-10-24-relay-concise-chat.md).


Painel de status implementado: etapa, modelo escolhido, tempo, tentativa e snapshots de tokens por tarefa. /status acumula os tokens informados nesta conversa. Cota é opcional e pertence à conta, com janelas próprias; não é porcentagem de execução da tarefa. Sem números estimados ou conversão de tokens para assinatura.


Relay é um agente de programação conversacional no terminal, usando a assinatura
Codex existente por autenticação oficial. Nome escolhido pelo usuário em
2026-10-23; JARVIS permanece no caminho local. Nome público não reservado.

## Entrega autorizada

Em 2026-10-24 o usuário autorizou ampliar o protótipo para uma entrega integrada,
com seleção automática de capacidade, trabalho em projetos e terminal colorido.
O [plano](docs/plans/2026-10-24-relay-project-agent.md) registra a aceitação e o
limite prioritário atualizado pelo usuário: parar em 40% de uso restante
(60% usado), substituindo o limite anterior de 50% restante. A ferramenta
informa uma janela semanal da conta, sem orçamento por chamada.

TypeScript/Node 24 com Codex App Server, login oficial, perfis configuráveis,
classificação local sem chamada extra, níveis de esforço suportados pelo catálogo,
edições estruturadas, contexto selecionado, cache revalidado por testes e reparo
de arquivos falhos. Conversa com cores, cancelamento, status e desfazer a última
alteração. Bench compara duas cópias iguais com testes protegidos.

## Limites reais

O verificador funcional suporta JavaScript Node sem dependências, com node:test.
Outros arquivos podem ser editados, mas sintaxe isolada ou ausência de testes não
produz aprovação funcional. Não há instalação automática de dependências, deploy,
banco, shell do modelo ou suporte universal a stacks. Exige Windows/MXC e Codex
na versão verificada. Não existe frontend web ou desktop.

Classificação heurística não conhece antecipadamente a dificuldade exata nem
garante consumo mínimo. Tentativas, contexto e reparos consomem tokens. Modelos
menores não garantem menos tokens. Só se declara economia observada quando ambas
as rotas passam nos mesmos testes protegidos e informam métricas. Testes gerados
pelo próprio modelo recebem aviso de confiança. Não convertemos tokens em cota.

## Preservação e manutenção

Edições têm backups e verificam concorrência. Segredos, caminhos ignorados e
links são excluídos; testes existentes são protegidos. O modelo não executa
comandos. Testes rodam em cópia isolada, sem credenciais, rede ou escrita no
projeto. Sem fallback que reduza isolamento. Nada é publicado ou enviado ao Git.

Evidências em [setup](docs/setup.md), comandos no [README](README.md) e limites
em [arquitetura](docs/architecture.md). Planos anteriores registram a evolução
histórica; o novo plano substitui seus limites de escopo. Revisar estes fatos
quando comportamento, versões, suporte ou evidências mudarem.
