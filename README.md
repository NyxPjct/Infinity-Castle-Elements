# Infinity Castle Elements — INSANITY 0.0.0

**Infinity Castle Elements** é um jogo original de plataforma troll, ação e sobrevivência da **NYX PROJECT R**, com campanha de **1000 fases**, quatro elementos jogáveis, singleplayer, multiplayer, inimigos, chefes, moedas, loja, boosts, cosméticos e uma dificuldade feita para o castelo aprender a odiar você de volta.

A versão **INSANITY 0.0.0** é a primeira versão definitiva do projeto e a edição oficial para Windows.

## Downloads para Windows

1. **Instalador:** [Infinity-Castle-Elements-Setup-0.0.exe](https://github.com/NyxPjct/Infinity-Castle-Elements/releases/download/v0.0/Infinity-Castle-Elements-Setup-0.0.exe)
2. **Portable:** [Infinity-Castle-Elements-Portable-0.0.exe](https://github.com/NyxPjct/Infinity-Castle-Elements/releases/download/v0.0/Infinity-Castle-Elements-Portable-0.0.exe)
3. **Pacote com os dois:** [Infinity-Castle-Elements-Windows-0.0.zip](https://github.com/NyxPjct/Infinity-Castle-Elements/releases/download/v0.0/Infinity-Castle-Elements-Windows-0.0.zip)

---

## Abertura e identidade

Ao iniciar o jogo, a apresentação acontece em três etapas:

1. tela preta da **NYX PROJECT R**, com a coruja roxa de olhos vermelhos e a assinatura **Apresenta:**;
2. tela cinematográfica de **INFINITY CASTLE ELEMENTS — INSANITY**, com os quatro elementos diante do castelo em clima de aventura fantástica;
3. menu principal com **Singleplayer, Multiplayer, Loja, Configurações e Sair**.

Na versão desktop, **Sair** fecha o jogo diretamente.

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

A escolha do elemento agora é feita diretamente pelos **quatro bonequinhos elementais** na tela antes de iniciar a fase, sem precisar descer a interface para procurar a seleção.

O progresso solo inclui fase atual, mortes, elemento, moedas, boosts e cosméticos.

## Multiplayer

O multiplayer foi criado para **2 jogadores**, com salas privadas por código e escolha independente de elemento. O sistema sincroniza jogadores, fase, mortes, chefes, runas, inimigos derrotados e reinícios.

Na edição desktop 0.0, o jogo já inclui a estrutura de servidor necessária. Para partidas entre computadores diferentes pela internet, os jogadores precisam se conectar à mesma instância de servidor multiplayer hospedada.

## Sistema de moedas e Loja Arcana

Moedas são recebidas ao concluir fases e derrotar inimigos. Elas podem ser usadas na **Loja Arcana** para comprar:

- **Runa de Escudo** — absorve um golpe fatal;
- **Botas do Vento** — aumenta temporariamente a velocidade;
- **Salto Arcano** — aumenta temporariamente a força do salto;
- **Coroa do Castelo** — cosmético permanente;
- **Aura Elemental** — cosmético permanente.

## Inimigos e ameaças

A campanha possui sentinelas, morcegos, espectros e ameaças especiais como armaduras vivas, fantasmas, dragões, projéteis e objetos que despencam do cenário.

A quantidade e a combinação de ameaças aumentam conforme o jogador avança.

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

Há chefes nas fases **100, 200, 300, 400, 500, 600, 700, 800, 900 e 1000**.

Eles utilizam barreiras, runas, rituais, projéteis e arenas próprias, com comportamento adaptado para singleplayer e multiplayer.

## Sistema anti-fase-impossível

O gerador protege áreas críticas como spawn, saída, placas, portões, runas e caminhos obrigatórios.

Também existe uma **sala de emergência**: se uma geração for detectada como estruturalmente inválida, aquela fase é substituída por um layout seguro em vez de deixar a partida quebrada.

## Auditoria das 1000 fases

A build possui auditoria própria para geração, renderização, estruturas críticas, inimigos e runtime dos quatro elementos.

Na INSANITY 0.0.0, o processo de validação verifica:

- **1000 fases**;
- **10 chefes**;
- **240 fases com portões**;
- **12 arquétipos**;
- **10 regiões**;
- renderização das fases;
- runtime dos quatro elementos;
- áreas críticas de spawn e saída.

## Configurações e menu de pausa

A versão desktop inicia **em tela cheia por padrão**.

Dentro de **Configurações** ficam centralizadas as opções de:

- **resolução** — Nativa, 4K, 1440p, 1080p, 1600×900, 1366×768 e 720p;
- **idioma da interface** — Português, Inglês, Espanhol, Francês, Alemão, Italiano, Holandês, Polonês, Russo, Turco, Japonês, Coreano, Chinês Simplificado, Chinês Tradicional, Árabe, Hindi, Sueco, Dinamarquês, Finlandês e Tcheco;
- **tela cheia**;
- **tremor de tela**;
- **redução de animações**.

Durante uma fase, pressione **ESC** para abrir o menu de pausa. Nele é possível:

- **Salvar jogo**;
- abrir **Configurações**;
- **Sair para o menu**;
- **Sair para desktop**.

Pressionar **ESC novamente** fecha o menu de pausa e continua a tentativa.

## Controles

- **A / D** ou **← / →** — movimento
- **W**, **↑** ou **Espaço** — pular
- **E** — habilidade elemental
- **R** — reiniciar fase
- **ESC** — abrir/fechar menu de pausa
- **F11** — alternar tela cheia

---

# Especificações de execução

## Versão oficial

A versão oficial é distribuída para **Windows 64 bits** em três opções:

- **Setup** — instalador tradicional do Windows;
- **Portable** — executável que abre diretamente, sem instalação;
- **Pacote ZIP** — contém o Setup e o Portable juntos.

O jogo já inclui os componentes necessários para funcionar. **O jogador não precisa instalar Node.js, npm, Express ou Socket.IO separadamente.**

## Requisitos recomendados

- **Windows 10 ou Windows 11 — 64 bits**
- processador **x64**
- **4 GB de RAM** ou mais
- aceleração gráfica compatível
- espaço livre para o jogo e os dados locais de save
- conexão com a internet somente para os recursos multiplayer online

## Tecnologias utilizadas

O jogo utiliza internamente:

- **Electron**
- **Node.js**
- **JavaScript**
- **HTML5**
- **CSS**
- **Canvas 2D**
- **Express**
- **Socket.IO**

Essas tecnologias fazem parte do aplicativo e não precisam ser instaladas manualmente pelo jogador.

## Instalação

### Instalador
Baixe:

**Infinity-Castle-Elements-Setup-0.0.exe**

Abra o arquivo, escolha a pasta de instalação e conclua o assistente. O instalador pode criar atalhos na Área de Trabalho e no Menu Iniciar.

### Portable
Baixe:

**Infinity-Castle-Elements-Portable-0.0.exe**

Abra o executável diretamente. Não é necessário instalar o jogo.

### Pacote completo
Baixe:

**Infinity-Castle-Elements-Windows-0.0.zip**

Extraia o arquivo para encontrar as versões Setup e Portable.

## Windows SmartScreen

A versão 0.0 ainda não utiliza certificado comercial de assinatura de código. Por isso, dependendo das configurações do Windows, o SmartScreen pode exibir um aviso de **editor desconhecido** ao abrir o executável pela primeira vez.
