# Infinity Castle Elements — INSANITY FIXED TEST 4.1.1

Build local de teste. **Não foi publicada no GitHub.**

Esta versão mantém os quatro elementos, singleplayer com um único elemento, multiplayer com escolha independente, moedas, Loja Arcana, boosts, cosméticos, inimigos, fullscreen, 10 regiões e 1000 fases.

## O que mudou nesta build

As fases **1 a 4** continuam servindo como falsa sensação de segurança. A partir da **fase 5**, a curva de maldade sobe imediatamente.

- inimigos entram já na fase 5;
- chão falso aparece muito mais cedo e com frequência maior;
- a saída começa a fugir já na fase 5 em padrões determinísticos;
- saídas falsas começam cedo;
- espinhos-surpresa de chão e teto entram praticamente no começo;
- blocos de pedra caem do teto muito antes;
- lustres, elevadores, plataformas que desaparecem, armaduras e esmagadores foram antecipados;
- portas falsas e saídas-isca aparecem ainda no primeiro trecho da campanha;
- fases mais avançadas combinam várias dessas mecânicas ao mesmo tempo;
- mais inimigos são adicionados conforme a campanha avança;
- mensagens de morte foram refeitas para reforçar a sensação de “agora eu sei onde está a armadilha... talvez”.

As armadilhas continuam determinísticas: a dificuldade foi aumentada para exigir memória, timing e repetição, não para virar RNG sem solução.

## Elementos

- 🪨 Terra — impacto sísmico, resistente a raízes.
- 💨 Ar — mais rápido, impulso aéreo, imune a vendavais.
- ☀️ Luz — resiste a maldições e usa clarão protetor/ataque em área.
- 🌑 Escuridão — ignora zonas de controle invertido e usa passo sombrio.

## Loja

Moedas são obtidas ao concluir fases e derrotar inimigos. A Loja Arcana permite comprar escudo, velocidade, salto e cosméticos.

## Teste das 1000 fases

Execute:

```bash
npm run test:levels
```

Nesta build a auditoria verifica geração, renderização, rotas estruturais, chefes, portões, áreas críticas e inimigos. Além disso, ela executa `startLevel()` e frames reais de gameplay nos quatro elementos para cada uma das 1000 fases.

### Correção crítica desta revisão

A build anterior podia mostrar apenas o background porque `processTrolls()` havia sido removida por engano durante uma refatoração. O primeiro update do personagem lançava um erro e interrompia o frame antes de desenhar a fase. A função foi restaurada e esse caminho agora faz parte obrigatória do auditor.

Também existe uma geração de emergência: se uma fase falhar na geração ou for detectada como estruturalmente inválida ao iniciar, o jogo substitui apenas aquela sala por um layout seguro em vez de deixar a tela vazia.

## Executar

No Windows, abra `INICIAR_JOGO.bat`.

Ou:

```bash
npm install
npm start
```

Abra `http://localhost:3000`.
