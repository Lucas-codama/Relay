# Relay: plano de implementação do protótipo

Status: aprovado e implementado em 2026-10-24, com provas locais e demonstração
real concluída. Limites e evidências estão em setup; não houve comparação adicional.
O [desenho](2026-10-24-prototipo-relay-design.md) também foi aprovado nessa data.
Resultados reais e limitações estão em [setup](../setup.md).

Objetivo: um pedido no terminal gera uma correção verificada da função de
demonstração, com seleção automática de capacidade e até uma escalada.
Arquitetura: CLI TypeScript/Node 24 coordena Codex App Server local; código
candidato é dado estruturado, aplicado só à cópia descartável. Verificação usa
QuickJS/WASM em runner separado e uma camada nativa do Codex no Windows.
Stack: Node 24.18.0, npm existente, TypeScript, jose, quickjs-emscripten e node:test.
Os [contratos e casos exatos](2026-10-24-prototipo-relay-contracts.md) fazem parte
integral deste plano; contêm package/tsconfig, tipos, fixture e expectativas.

## Escopo, autorização futura e invariantes

A aprovação deste plano autorizou implementação e dependências somente neste
projeto, os testes locais e uma prova adaptativa ao vivo na conta escolhida pelo
usuário: até dois turnos de síntese. O login exige consentimento humano oficial.
A referência robusta direta é opcional, selecionada explicitamente pelo usuário
no comando `--compare`; adiciona um turno, total máximo três no experimento.
Sem esse parâmetro, não é executada. Não há teste pago por API ou outro provedor.

Estado local futuro do aplicativo: `%LOCALAPPDATA%/Relay/`, com host ID, perfis,
credenciais protegidas e estado Codex próprio. Esse é o único novo local persistente
fora do projeto solicitado para a prova. Não mudar perfis, credenciais ou arquivos
do Codex já instalado. Relatórios sanitizados do experimento ficam nesse estado;
cópias de trabalho usam diretório temporário único do Relay. Documentar o caminho
real para o usuário, sem copiar caminhos pessoais para fontes versionadas.

Sem instalações globais, npm link, provisionamento de sandbox/contas/firewall,
publicação, push, commit, serviços, daemon ou alteração de permissões da máquina.
Políticas gerenciadas não são removidas. Falta de um pré-requisito nativo bloqueia
só a demonstração dependente; testes unitários e documentação continuam.
Não ler/copiar auth.json privado de outro cliente para implementar o login.

Limites: 180 s por tentativa e login; 600 s por execução adaptativa, mais uma
janela separada de até 600 s se --compare for selecionado. A referência só usa um
turno. Validação: 5 s/caso e 20 s/conjunto, dentro da janela restante. Cancelamento
espera até 10 s antes de encerrar recursos próprios. Turnos não equivalem a chamadas
internas/teto de tokens. Não renovar cotas, iniciar trials ou repetir modelos
automaticamente fora dessa contagem. Mudança de etapa não zera o orçamento.

## Mapa dos arquivos a criar

| Arquivos | Responsabilidade |
| --- | --- |
| package.json, package-lock.json, tsconfig.json | Fundação e dependências fixadas |
| src/contracts.ts, src/config.ts | Tipos, limites e perfis validados |
| src/rpc.ts, src/processes.ts | JSONL, pedidos/eventos e ciclo de vida de filhos |
| src/auth.ts, src/store.ts, src/windows-store.ps1 | OAuth/OIDC, renovação serializada, armazenamento protegido |
| src/codex.ts | Adaptador de síntese com ferramentas recusadas |
| src/fixture.ts, fixtures/discount/discount.mjs | Cópia descartável e fonte defeituosa conhecida |
| src/sandbox.ts, src/runner.ts, src/verify.ts | Runner QuickJS, sandbox nativo e comparação no host |
| src/policy.ts, src/controller.ts | Seleção determinística, limites e escalada |
| src/usage.ts, src/report.ts, src/cli.ts | Métricas, relatório e interface |
| tests/config.test.ts, tests/policy.test.ts, tests/usage.test.ts | Domínio e decisões puras |
| tests/rpc.test.ts, tests/processes.test.ts, tests/codex.test.ts | Protocolo falso, síntese, erros e término |
| tests/auth.test.ts, tests/store.test.ts | Autenticação sintética e proteção do estado |
| tests/verify.test.ts, tests/controller.test.ts, tests/cli.test.ts | Fixture, fluxo integrado falso e terminal |
| tests/helpers/fake-app-server.mjs | Servidor local determinístico, sem modelo/rede |
| tests-native/sandbox.test.ts | Provas reais locais da fronteira do runner no Windows |

Coordenador é o único escritor de configuração, lockfile, contratos e integração.
Execução serial por dependência; revisão independente é somente leitura. Todos os
testes de autenticação usam chaves/tokens sintéticos, sem credenciais reais.
Não mover nem reformatar a fundação existente. Manter módulos abaixo da referência
de 350 linhas quando isso corresponder a responsabilidades reais.

## Entrega 1: fundamento e controlador puro

Dependências: nenhuma etapa de aplicativo. Produz tipos e decisões consumidos
por todas as outras entregas. Critérios: A1, A4, A5, A9 na parte determinística.

1. Criar package/tsconfig do anexo e instalar com `npm install --ignore-scripts`.
   Fixar o lockfile. Rodar `npm audit --json` e `npm audit --omit=dev --json`;
   registrar advisories/escopo e investigar compatibilidade, sem --force.
2. Escrever primeiro tests/config, policy e usage com toda a matriz do anexo.
   Testes devem falhar por ausência dos módulos, não por erro de configuração.
3. Implementar contracts/config/policy/usage mínimos. Perfil robusto só é escolhido
   após implementation e tentativa econômica; qualquer outra categoria encerra.
4. Rodar `npm run typecheck` e `npm test`. Confirmar sucesso de primeira tentativa,
   escalada única, falta de tempo, dados ausentes e snapshots cumulativos.
5. Adicionar test:native e compilação de tests-native conforme o anexo; os testes
   comuns usam adaptadores falsos e não disparam sandbox real nem login.

Critério de saída: nenhum teste comum faz inferência, HTTP público ou execução
de código candidato no Node do coordenador. Relatar que isso ainda não prova Codex.

## Entrega 2: transporte e preflight sem inferência

Consome contratos/limites da entrega 1. Produz RpcClient e ProcessOwner para
os adaptadores de síntese e sandbox. Critérios: A1, A6, A9 de protocolo.

1. Criar o servidor falso como processo filho controlado. Em rpc.test enviar
   uma resposta dividida em três chunks, duas linhas juntas, JSON inválido,
   ID duplicado, EOF, timeout e notificação desconhecida. Exigir resolução
   única do pedido certo e encerramento explícito nos cenários inválidos.
2. Implementar rpc.ts com request/notify/eventos, limite 1 MiB e rejeição de
   pedidos pendentes ao fechar. Não registrar buffers de tokens ou comandos brutos.
3. Em processes.test, filho que aguarda stdin, filho que termina cedo e filho
   que não responde a interrupção. Confirmar timer, propriedade e término.
   Usar PID/handle do filho criado; nunca matar por nome do executável.
4. Implementar processes.ts com spawn por vetor e env mínimo. Na prova Windows,
   confirmar árvore por mecanismo nativo existente e encerrar somente os PIDs
   registrados. Não depender de sinais POSIX nem declarar limpeza sem confirmação.
5. Implementar doctor em cli.ts: Node, npm, pwsh e Codex; handshake local,
   requirements efetivos e capacidades sem thread/turno. Distinguir binário
   ausente, versão não suportada e sandbox indisponível. Nada lê token pessoal.
6. Gerar schema da versão real em área temporária, conferir os campos requeridos
   de initialize, turn/start, command/exec/write/terminate e eventos de consumo.
   Em vez de copiar o bundle inteiro, manter só tipos/guards usados e testes de
   compatibilidade. Versão divergente exige conferir esse contrato antes do live.

Verificar: `npm test` e `npm run build`, depois `npm run doctor`. O handshake
não prova login/acesso a modelos. Falha nativa não é resolvida desativando sandbox.

## Entrega 3: avaliador isolado antes de qualquer síntese

Consome transporte/processos e fixture exata do anexo. Produz Verifier e um
certificado local de preflight válido para esta combinação de versão/política.
Critérios: A6, A7. Nenhum modelo é necessário.

1. Criar fixture.ts, fonte defeituosa e os 15 casos fixos fora da cópia editável.
   No teste nativo, exigir três falhas da baseline e 15 passes da referência.
   Conferir hashes antes/depois e recusar symlink/junction nos caminhos próprios.
2. verify.test injeta SandboxPort com respostas literais para testar contagem,
   comparação, falhas e saída incompleta, sem executar código candidato. Implementar
   createVerifier e runner.ts conforme o anexo QuickJS. Exportação ausente, Promise,
   import proibido, erro sintático, não número, infinito, recursão, OOM e process.exit
   são candidatos reais do gate nativo. O host nunca importa o candidato.
3. Implementar sandbox.ts usando somente command/exec sandboxed, stdin protegido,
   processId e env mínimo. App Server auxiliar não recebe OAuth e não inicia turnos.
   O estado próprio não serve para contornar requirements; comparar e respeitar
   restrições gerenciadas da execução nativa. Na dúvida, preflight não é aprovado.
4. Em tests-native/sandbox.test.ts, rodar referência e os candidatos adversos
   listados acima pelo caminho completo. Criar sentinela sintética de leitura
   e escrita; testar negação e integridade. Usar listener local próprio apenas
   para conferir isolamento de rede, sem enviar credenciais ou alcançar terceiros.
5. Aplicar timeout por caso/conjunto, limite de memória/saída e cleanup de handles
   e processos. Exigir confirmação de término mesmo se o runner retornar exit 0.
   Um teste negativo que trava/derruba o coordenador torna a entrega reprovada.
6. Rodar `npm test` e `npm run test:native`. Preflight registra versão Codex/Node,
   política efetiva, hashes de runner/avaliador e resultado; invalidar ao mudar
   qualquer um. Prova incompleta retorna environment e impede código gerado.

Não instalar Docker, compilador nativo ou Windows Sandbox para fazer passar.
Se a camada nativa não estiver provisionada, registrar a condição exata e continuar
com as entregas independentes; nenhum candidato real é executado nesse estado.

## Entrega 4: autenticação oficial e estado privado

Consome RpcClient/ProcessOwner; a implementação pode avançar com testes sintéticos
mesmo se a entrega nativa estiver bloqueada. Critérios: A2/A3, sem inferência aqui.

1. Criar store.ts e windows-store.ps1. Estado é `%LOCALAPPDATA%/Relay`; credenciais
   por registrationId vinculado à tripla issuer/subject/clientId validada, host ID
   opaco estável e perfis separados. Usar seleção/read/lock definidos no anexo.
   Recusar diretório/arquivo redirecionado. Arquivo temporário é criado vazio,
   recebe ACL sem herança (usuário atual e SYSTEM), verificada antes de escrever
   qualquer segredo. Gravação/renomeação atômica; modo inseguro é erro, não aviso.
   Helper PowerShell recebe dados por stdin, sem segredo em argumentos ou logs.
2. Testar ACL incorreta, interrupção de escrita, tentativa de acessar outro registro,
   lock concorrente, duas contas no mesmo clientId e recusa de substituir identidade.
   Usar arquivos temporários e segredos sintéticos, nunca estado pessoal. Não alterar ACLs fora
   do diretório Relay. Salvar alterações de access/refresh/expiry como unidade.
3. auth.test usa provedor HTTP falso injetado somente em teste, JWKS/chaves locais,
   state/nonce fixados pelo teste e clock controlado. Recusar assinatura, issuer,
   audience, nonce, expiração, escopo e client_id inválidos e callback repetido.
4. Implementar OAuth público oficial: callback em 127.0.0.1 em porta livre,
   `/auth/callback`, state/nonce/PKCE S256 novos; registro dinâmico ou client_id
   emitido salvo. Usar jose para verificar assinatura/claims, não apenas decodificar.
   A configuração de produção só aceita origens oficiais; URL de teste não vira flag
   de produção. Estado é descartado no sucesso, cancelamento ou timeout de 180 s.
5. Renovação é serializada por registro via lock exclusivo; nunca renovar em dois
   processos o mesmo refresh token. Invalid grant encerra a sessão local e pede
   nova autorização; não alterna conta. Saída/relatório omitem tokens e URL com
   id_token_hint. Reutilizar client_id/host ID corretamente após reiniciar.
6. Acrescentar seleção explícita de registro salvo quando houver mais de um;
   o protótipo usa um ativo por vez. Exibir rótulo local, nunca tokens. Qualquer
   conta nova passa por consentimento/validação; não é fallback automático.
7. Com o plano aprovado e ação humana no navegador, provar login no
   ambiente real. Esta etapa só consulta catálogo; não cria turnos de inferência.
   Se faltar permissão do plano, registrar access e concluir as partes offline.

Fonte canônica é o fluxo SIWC aberto/local indicado abaixo. Não pedir chave de API,
reutilizar cookies ou ampliar planos para completar a prova. Se o fluxo oficial
não funcionar para esta conta, apresentar evidência do bloqueio sem improvisar rota.

## Entrega 5: síntese delimitada, aplicação e controlador

Consome Verifier, login, perfis e processo. Critérios: A3-A5, A8 e A9.

1. tests/codex.test.ts (criar junto ao adaptador) usa RPC falso para completed,
   failed, interrupted, saída vazia, JSON inválido e tentativa de ferramenta.
   Nenhuma mensagem final parcial é interpretada como tarefa concluída.
2. Implementar codex.ts: App Server próprio com token apenas no env desse filho,
   configurações de processo conforme SIWC e ferramentas desabilitadas. Usar
   strict-config e descobrir suporte na versão local; não tocar config global.
   Configuração não reconhecida bloqueia síntese até adaptar oficialmente.
3. Na conexão, consultar requirements e catálogo por conta, cruzar esforço do
   modelo com schema/capacidades. Perfis iguais são recusados. Listagem não marca
   acesso como validado; somente um turno concluído dá essa evidência.
4. Abrir uma thread nova por tentativa, fornecer outputSchema do anexo e contexto
   limitado; recusar toda chamada de ferramenta ou ampliação de permissão.
   O modelo retorna fonte ou needsInput; Relay faz a única escrita em discount.mjs.
   Validar realpath, tamanho, hash anterior e alvo fixo, sem extrair arquivos de patch.
5. controller.test injeta Verifier e relógio: economico passed; implementation seguido de robusto
   passed; dois implementation; access/environment/scope/integrity/inconclusive;
   interrupção e relógio expirado. Confirmar número exato de turnos por cenário.
   No modo reference, exigir robusto direto e nenhuma segunda tentativa.
6. Implementar controller.ts com decide(), orçamento compartilhado e Verifier.
   Em falha funcional, produzir diagnóstico curto a partir dos testes confiáveis;
   não pedir a outra IA para classificar a falha. Não escalar ambiente/cota/login.
   Antes de escalar, confirmar processo anterior encerrado e preservar evidência.

Verificação: `npm run check` e `npm run test:native`. Somente depois de ambos e
do login comprovados, liberar o comando demo para a execução real delimitada.

## Entrega 6: interface, métricas e prova ao vivo

Consome controlador pronto. Critérios: A8-A10 e experiência de terminal.

1. Implementar report.ts e cli.ts: doctor e demo; primeira configuração orientada
   escolhe dois perfis do catálogo sem nomes comerciais permanentes no código.
   Mensagens em português; sem dependência de cor, desenho animado ou TUI completa.
   Sem prompt extra a cada mudança de modelo já permitida pela configuração.
2. cli.test injeta stdin/streams/clock e testa comando desconhecido, prompt vazio,
   perfil ausente, first-pass, escalada, Ctrl+C e relatórios sem uso disponível.
   Códigos: 0 verificado; 1 falha funcional/inconclusiva/integridade; 2 entrada/escopo;
   3 ambiente/pré-requisito; 4 acesso/cota/login; 5 limite; 130 cancelamento.
3. Salvar relatório JSON versionado por allowlist de campos do contrato, nunca
   serializar objetos de sessão/erro brutos. Fonte completa não é log padrão;
   diff fica na cópia local de inspeção, referenciado por ID opaco no relatório.
   Persistir versões Relay/Codex/Node, duração por tentativa, resultados dos casos,
   modo e hash inicial. Testar round-trip desses campos e sentinela contra vazamento.
4. Obter cópia inicial nova; executar baseline defeituosa e demonstrar sua falha.
   Depois enviar um pedido normal de correção. Registrar zero, uma ou duas
   tentativas reais conforme o que ocorrer; não provocar falha para encenar escalada.
5. Opcional --compare: nova cópia byte-idêntica, mesmo contrato/pedido/ambiente,
   perfil robusto direto e um turno. Não inclui nova classificação, revisor IA ou
   repetição automática. Relatório separa viabilidade, exemplo e hipótese de economia.
6. Revisão independente somente leitura do diff/arquivos novos, testes, auth e
   fronteira do runner. Verificar achados e corrigir só os substanciados; rerodar
   checks afetados. Nenhum número fixo de rodadas substitui essa evidência.
7. Atualizar README, PRODUCT, AGENTS, arquitetura, design, onboarding, qualidade e
   setup com comandos que de fato existem, resultados, limites e próxima ação.
   Relatar bloqueios com causa e retomada; ausência de login ou sandbox não vira pass.

## Entrega, rastreabilidade e recuperação

| Evidência | Cobertura do desenho |
| --- | --- |
| Domínio/config/policy/usage e protocolo falsos | A1, A4, A5, A6, A9 |
| OAuth/store sintéticos + login real consentido | A2, A3 |
| Fixture baseline/referência/adversos + sandbox real | A6, A7 |
| Tarefa ao vivo com verificação externa | A3, A8 |
| --compare somente quando selecionado | A10 |

Antes de editar configurações existentes, preservar conteúdo em backup fora do
Git e reaplicar somente mudanças necessárias. O primeiro package/lock/config de
aplicativo é novo. Cancelar não limpa trabalho do usuário. Cópias Relay só são
removidas por caminho/manifesto próprios verificados; manter falhas para inspeção.
Não usar git clean/reset nem matar processos de outros clientes. Revogar somente
a sessão Relay pelo fluxo oficial se o usuário pedir; nunca sair do Codex pessoal.

Definição de conclusão: código e checks relevantes passam, revisão tem achados
resolvidos/dispostos, prova real concluída ou bloqueio externo comprovado é
explicitado, documentos descrevem o estado real e nenhuma promessa de economia
generalizada é feita. O protótipo não é considerado plenamente viável só por mocks.

## Fontes e verificações do plano (2026-10-24)

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Sandbox Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [Registro/login SIWC](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Sessões e renovação](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [SIWC e App Server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [QuickJS/WASM upstream](https://github.com/justjake/quickjs-emscripten)
- [jose upstream](https://github.com/panva/jose)
- [Limites de permissões do Node 24](https://nodejs.org/download/release/v24.18.0/docs/api/permissions.html)

Na preparação foram consultados Context7 `/justjake/quickjs-emscripten` e
`/panva/jose` e metadados npm das versões fixadas. Pacotes foram instalados
somente na execução posterior à aprovação; ver evidências em setup.
O CLI local 0.163.0-alpha.11.2 gerou schemas com command/exec, env, stdin, timeout,
limite de saída e terminate; isso comprova a forma do pedido, não seu isolamento.
A política readOnly local não deve ser confundida com restrição completa de leitura;
o interpretador sem bindings limita o candidato e a prova nativa testa a segunda
camada. Se a prova não passar, não há fallback sem isolamento.
