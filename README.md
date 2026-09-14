# Pit Stop da Saúde Mental — protocolo de 60 segundos

Página única e autocontida (HTML + CSS + JS, logo embutido em base64). Não exige servidor: abrir o arquivo no navegador já funciona.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `pit_stop_rog.html` | A página. É o único arquivo que precisa ir para produção. |
| `harness.js` | Suíte de testes em jsdom: 46 verificações da sessão completa. |
| `package.json` | Só o jsdom, usado pelos testes. |

## Linha do tempo da sessão

| Trecho | O que acontece |
| --- | --- |
| 0–3 s | Preparação, contagem 3, 2, 1 |
| 3–8 s | Respiração natural |
| 8–56 s | 6 ciclos de 3 s inspiração + 4 s expiração + 1 s de pausa opcional |
| 56–60 s | Respiração natural |
| 60 s | Tela final |

Tudo é derivado de `performance.now()` a cada quadro: anel, contador, barra de progresso e cronômetro leem o mesmo tempo decorrido. A duração de cada etapa vai para o CSS pela variável `--step-dur`, então a animação acompanha a contagem.

A voz acompanha a instrução na tela: são 14 falas ancoradas na linha do tempo — abertura, "Inspirar" e "Expirar" em cada um dos 6 ciclos, e encerramento. A pausa não é narrada. Ela nunca controla o tempo: se a síntese falhar, não existir no navegador ou o aparelho estiver no mudo, a sessão roda igual, guiada pelo texto e pelo número na tela.

A voz não define `utterance.voice` de propósito. Escolher explicitamente a primeira voz pt-BR da lista costuma cair na "Google português do Brasil", que é remota (`localService:false`) e depende de rede; como `cancel()` roda logo antes de cada `speak()`, a requisição é abortada e nada toca. Deixando o navegador escolher, ele usa a voz local do sistema.

## Rodar os testes

```bash
npm install
npm test
```

Saída esperada: `46/46 verificacoes aprovadas`. O script sai com código 1 se algo falhar.

Cobertura: seleção de condição e arranque, os 60 s quadro a quadro (transições em 3, 8, 11, 15 s e a cada 8 s até 56 s), rótulos de ciclo, desvio do cronômetro, tela final, disparo e conteúdo das falas, reinício pelos dois botões, sessão com `speak()` lançando exceção, sessão sem API de voz, e aba em segundo plano com os quadros congelados.

## O que ainda NÃO foi testado

Estas duas coisas nunca foram validadas e são o motivo desta sessão na nuvem existir:

1. **Sincronia visual da animação.** O jsdom não executa animação CSS. Está confirmado que a duração correta chega à variável que o CSS consome, mas não que o anel expande e contrai no ritmo certo na tela.
2. **Áudio.** Nenhuma máquina headless tem saída de som nem motor de voz. Está confirmado que a função de fala é chamada com o texto certo no instante certo, e nada além disso. **Ouvir a voz continua sendo teste manual em um aparelho real.**

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
