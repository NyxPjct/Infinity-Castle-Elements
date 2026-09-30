# Infinity Castle Elements — INSANITY 0.0

**Infinity Castle Elements** é um jogo original de plataforma troll, ação e sobrevivência da **NYX PROJECT R**, com campanha de **1000 fases**, quatro elementos jogáveis, singleplayer, multiplayer, inimigos, chefes, moedas, loja, boosts, cosméticos e uma dificuldade feita para o castelo aprender a odiar você de volta.

A versão **INSANITY 0.0** é a primeira versão definitiva do projeto e também a base oficial da edição desktop para Windows.

**Build oficial Windows:** instalador e versão portátil em `.exe`, gerados automaticamente pelo projeto.

## Abertura e identidade

Ao iniciar o jogo, a apresentação acontece em três etapas:

1. tela preta da **NYX PROJECT R**, com a coruja roxa de olhos vermelhos e a assinatura **Apresenta:**;
2. tela cinematográfica de **INFINITY CASTLE ELEMENTS — INSANITY**, com os quatro elementos diante do castelo em clima de aventura fantástica;
3. menu principal com **Singleplayer, Multiplayer, Loja, Configurações e Sair**.

Na versão desktop, **Sair** fecha o executável diretamente.

## Campanha com 1000 fases

A campanha vai da fase **1 até a 1000**. A partir da **fase 5**, a dificuldade INSANITY começa a escalar de verdade. As pegadinhas são determinísticas: a ideia é morrer, aprender o que aconteceu e tentar superar o castelo na próxima tentativa.

O jogo possui **12 arquétipos de layout**, **10 regiões** e um chefe a cada 100 fases, totalizando **10 chefes**.

### Regiões

- **001–100 — Portão e Pátio Real**
- **101–200 — Galeria Nobre**
- **201–300 — Masmorras Profundas**
- **301–400 — Torre do Relógio**
- **401–500 — Biblioteca Viva**
- **501–600 — Capela Assombrada**
- **601–700 — Jardins Suspensos**
- **701–800 — Muralhas da Tempestade**
- **801–900 — Trono Rubro**
- **901–1000 — Coração Impossível**

## Elementos jogáveis

### 🪨 Terra
Mais pesado e controlado, resistente a raízes e equipado com **Impacto Sísmico**, capaz de destruir ou neutralizar ameaças próximas.

### 💨 Ar
Mais rápido e móvel, imune a vendavais e equipado com **Impulso Aéreo**, que melhora temporariamente velocidade, gravidade e controle no ar.

### ☀️ Luz
Resistente a maldições e equipada com **Clarão Protetor**, que fornece proteção temporária e pode atingir inimigos próximos.

### 🌑 Escuridão
Ignora zonas de controles invertidos e usa **Passo Sombrio**, ficando temporariamente capaz de atravessar diversos perigos.

## Singleplayer

No modo solo, o jogador escolhe **um único elemento** antes de começar. Portões, placas e rituais de chefes são adaptados para que a campanha continue possível com apenas um personagem.

O progresso solo inclui fase atual, mortes, elemento, moedas, boosts e cosméticos.

## Multiplayer

O multiplayer foi criado para **2 jogadores**, com salas privadas por código e escolha independente de elemento. O servidor sincroniza jogadores, fase, mortes, chefes, runas, inimigos derrotados e reinícios.

Na edição desktop 0.0, o jogo inclui o servidor Node.js dentro do aplicativo. Para multiplayer entre computadores diferentes pela internet, ambos os jogadores precisam utilizar a mesma instância de servidor hospedado; a infraestrutura pública de matchmaking não está incluída nesta versão inicial.

## Sistema de moedas e Loja Arcana

Moedas são recebidas ao concluir fases e derrotar inimigos. Elas podem ser usadas na **Loja Arcana** para comprar:

- **Runa de Escudo** — absorve um golpe fatal;
- **Botas do Vento** — aumenta temporariamente a velocidade;
- **Salto Arcano** — aumenta temporariamente a força do salto;
- **Coroa do Castelo** — cosmético permanente;
- **Aura Elemental** — cosmético permanente.

## Inimigos e ameaças

A campanha possui sentinelas, morcegos, espectros e ameaças especiais como armaduras vivas, fantasmas, dragões, projéteis e objetos que despencam do cenário. A quantidade e a combinação de ameaças aumentam conforme o jogador avança.

## Pegadinhas INSANITY

Entre as mecânicas atuais estão:

- chão falso;
- plataformas que desaparecem;
- pontes quebráveis;
- espinhos normais e surpresa;
- espinhos de teto;
- saídas falsas;
- saída que foge;
- portas falsas;
- blocos e lustres caindo;
- paredes que avançam de surpresa;
- esmagadores;
- elevadores;
- estantes móveis;
- controles invertidos;
- rajadas de vento;
- fantasmas;
- armaduras vivas;
- dragões;
- projéteis;
- combinações de várias pegadinhas na mesma sala.

## Chefes

Há chefes nas fases **100, 200, 300, 400, 500, 600, 700, 800, 900 e 1000**. Eles utilizam barreiras, runas, rituais, projéteis e arenas próprias, com comportamento adaptado para solo e multiplayer.

## Sistema anti-fase-impossível

O gerador protege áreas críticas como spawn, saída, placas, portões, runas e caminhos obrigatórios. Também existe uma **sala de emergência**: se uma geração for detectada como estruturalmente inválida, aquela fase é substituída por um layout seguro em vez de deixar a partida quebrada.

## Auditoria das 1000 fases

A build possui auditoria própria para geração, renderização, estruturas críticas, inimigos e runtime dos quatro elementos.

```bash
npm run test:levels
```

Na INSANITY 0.0, a auditoria definida pelo projeto verifica as **1000 fases**, os **10 chefes**, as **240 fases com portões**, os **12 arquétipos**, as **10 regiões**, renderização e **4000 frames de runtime** dos quatro elementos.

## Controles

- **A / D** ou **← / →** — movimento
- **W**, **↑** ou **Espaço** — pular
- **E** — habilidade elemental
- **R** — reiniciar fase
- **F11** — alternar tela cheia no desktop
- **Esc** — sair da tela cheia

# Especificações de execução

## Versão desktop para Windows

A versão desktop utiliza **Electron** e já leva o runtime necessário junto do jogo. Por isso, quem instalar o `.exe` **não precisa instalar Node.js, npm, Express ou Socket.IO separadamente**.

O projeto gera dois formatos:

- **Infinity-Castle-Elements-Setup-0.0.exe** — instalador para Windows;
- **Infinity-Castle-Elements-Portable-0.0.exe** — versão portátil, sem instalação.

Requisitos recomendados para a build desktop:

- Windows 10 ou Windows 11 de 64 bits;
- processador x64;
- 4 GB de RAM ou mais;
- aceleração gráfica compatível com Chromium;
- espaço livre para o aplicativo e os dados locais de save.

## Tecnologias

O projeto utiliza:

- **Electron**
- **Node.js**
- **JavaScript**
- **HTML5**
- **CSS**
- **Canvas 2D**
- **Express**
- **Socket.IO**

## Rodar pelo código-fonte

Para executar a versão web pelo código-fonte, é necessário ter **Node.js 18 ou superior** e **npm**.

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

No Windows também é possível usar:

```text
INICIAR_JOGO.bat
```

## Rodar a versão desktop em desenvolvimento

Depois de instalar as dependências:

```bash
npm install
npm run desktop
```

## Gerar os executáveis do Windows

```bash
npm install
npm run dist:win
```

Os arquivos finais são colocados na pasta `dist`.
