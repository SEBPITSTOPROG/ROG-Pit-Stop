# Pit Stop da Saúde Mental — protocolo de 60 segundos

Página única e autocontida (HTML + CSS + JS, logo embutido em base64). Não exige servidor: abrir o arquivo no navegador já funciona.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `pit_stop_rog.html` | A página. É o único arquivo que precisa ir para produção. |
| `harness.js` | Suíte de testes em jsdom: 58 verificações da sessão completa. |
| `package.json` | Só o jsdom, usado pelos testes. |

## Linha do tempo da sessão

| Trecho | O que acontece |
| --- | --- |
| 0–3 s | Preparação, contagem 3, 2, 1 |
| 3–8 s | "Respire naturalmente" |
| 8–56 s | 6 ciclos de 3 s inspiração + 4 s expiração + 1 s de pausa confortável |
| 56–60 s | "Respire naturalmente" |
| 60 s | Tela final |

Tudo é derivado de `performance.now()` a cada quadro: anel, contador, barra de progresso e cronômetro leem o mesmo tempo decorrido. A duração de cada etapa vai para o CSS pela variável `--step-dur`, então a animação acompanha a contagem.

A voz tem **6 falas** ancoradas na linha do tempo: abertura (0 s), "Recupere o foco" e "Reduza o ruído" no 1º ciclo (8 s e 11 s) e no 4º (32 s e 35 s), e encerramento (60 s). Ela nunca narra a contagem, nem diz "inspire"/"expire", nem anuncia a pausa — isso fica no texto e no número da tela. E nunca controla o tempo: se a síntese falhar, não existir no navegador ou o aparelho estiver no mudo, a sessão roda igual até os 60 s.

### Duas regras de voz que vieram de falhas reais em celular

Ambas custaram uma sessão inteira de depuração. Os testes travam as duas.

1. **Não definir `utterance.voice`.** Escolher a voz na mão emudece o aparelho. Filtrar por `localService` não resolve: o Android reporta `false` para as vozes do próprio sistema e o iOS reporta `true`, então qualquer filtro se comporta diferente nas duas plataformas para as quais a página é publicada. Com `lang="pt-BR"` e `voice` indefinido, o navegador resolve certo nos dois.

2. **Não chamar `cancel()` antes de cada `speak()`.** Essa sequência trava a engine do Chrome no Android, que passa a falhar em silêncio. Só `clearSpeech()` cancela, no reinício — que é o único momento em que interromper faz sentido.

E o **número de falas é regra de plataforma, não de conteúdo**: com uma fala a cada 3 s (14 na sessão) a engine do celular trava e emudece o resto. Seis, espaçadas, aguentam.

## Rodar os testes

```bash
npm install
npm test
```

Saída esperada: `58/58 verificacoes aprovadas`. O script sai com código 1 se algo falhar.

Cobertura: seleção de condição e arranque, os 60 s quadro a quadro (transições em 3, 8, 11, 15 s e a cada 8 s até 56 s), rótulos de ciclo, desvio do cronômetro, tela final, disparo e conteúdo das falas, reinício pelos dois botões, sessão com `speak()` lançando exceção, sessão sem API de voz, e aba em segundo plano com os quadros congelados.

## Verificação visual

O jsdom não executa animação CSS, então a sincronia visual foi medida à parte, em Chromium real, com `visual-sync-check.js` (precisa de `npm i -D playwright`). Ele abre a página, roda a sessão e mede o diâmetro renderizado de `.core` em instantes fixos, salvando capturas e a tabela em `screenshots/`.

Resultado medido (base de 92 px): inspiração cresce 80,96 → 112,24 px em 3 s; expiração reduz 112,24 → 80,96 px em 4 s (queda mais lenta que a subida, como esperado); pausa fica estável em 80,96 px.

## O que ainda NÃO foi testado

**Áudio em aparelho real.** Máquina headless não tem saída de som nem motor de voz — `getVoices()` volta vazio, então nenhuma fala chega a ser sintetizada aqui. Está confirmado que a função de fala é chamada com o texto certo no instante certo, e que a sessão roda igual quando o áudio falha. **Ouvir a voz continua sendo teste manual em um aparelho real.**

---

## Prompt para colar na sessão cloud

```
Este repositório tem uma página única, pit_stop_rog.html: um protocolo guiado de
respiração de 60 segundos.

Contexto: a lógica de tempo já foi testada em jsdom (rode `npm test`, devem passar
43 verificações). O que nunca foi validado é a sincronia VISUAL da animação CSS,
porque jsdom não executa animação. É isso que eu quero que você verifique aqui.

Tarefa:

1. Rode `npm test` primeiro e confirme que as 43 verificações passam. Se alguma
   falhar, pare e me diga qual antes de seguir.

2. Instale o Playwright com Chromium. Se o download do navegador for bloqueado
   pela rede do sandbox, me avise em vez de contornar com simulação.

3. Escreva um script que abra pit_stop_rog.html no Chromium, clique em uma das
   condições operacionais, clique em "Iniciar protocolo" e capture telas nos
   instantes 1, 4, 8, 9.5, 11, 13, 15, 15.5, 32, 55.5, 57 e 60.5 segundos.
   Salve em screenshots/ com o instante no nome do arquivo.

4. Em cada captura, meça o tamanho renderizado do elemento .core (use
   getBoundingClientRect via evaluate, no mesmo instante da captura) e monte uma
   tabela instante x diâmetro. Salve também como screenshots/medicoes.md.

O que precisa ser verdade:

- Entre 8 e 11 s o núcleo cresce de forma contínua (inspiração de 3 s).
- Entre 11 e 15 s ele encolhe de forma contínua (expiração de 4 s), e essa queda
  é visivelmente mais lenta que a subida anterior.
- Entre 15 e 16 s ele fica parado no tamanho pequeno (pausa de 1 s).
- Em 8 s e em 32 s, o texto na tela é "Inspirar" e o contador está em 3.
- Em 60.5 s a tela final está visível.

Me diga o que bateu e o que não bateu, com os números. Se o núcleo não estiver
acompanhando as durações, corrija o CSS ou o JS e rode tudo de novo.

Não tente validar áudio: a VM não tem som. Deixe isso para mim.
```
