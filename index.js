require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  Routes,
  REST
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Valores das filas
const valores = [100, 50, 20, 10, 5, 2, 1];
let filas = {};
let mensagensFilas = {};
let modosFilas = {};

// ================= FUNÇÃO DELAY =================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================= COMANDO =================
const commands = [
  new SlashCommandBuilder()
    .setName("criarpainel")
    .setDescription("Cria painel de filas (Admin)")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.once("ready", () => {
  console.log(`🔥 Bot Online como ${client.user.tag}`);
});

// ================= FUNÇÃO ATUALIZAR EMBED =================
async function atualizarEmbed(filaId) {
  const fila = filas[filaId];
  const msg = mensagensFilas[filaId];
  const modo = modosFilas[filaId] || "NENHUM";
  if (!msg) return;

  const jogadores = fila.length
    ? fila.map(id => `<@${id}>`).join("\n")
    : "Nenhum jogador na fila";

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(msg.embeds[0].data.title)
    .setDescription(
      `💰 Valor: ${msg.embeds[0].data.description.split("\n")[0].replace("💰 Valor: ", "")}\n` +
      `Modo: ${modo}\n👥 Jogadores (${fila.length}/2):\n${jogadores}`
    );

  await msg.edit({ embeds: [embed] });
}

// ================= INTERAÇÕES =================
client.on("interactionCreate", async interaction => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand() && interaction.commandName === "criarpainel") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "❌ Apenas admins podem criar painel.", ephemeral: true });
    }

    // Cria Select Menu para escolher modo
    const select = new SelectMenuBuilder()
      .setCustomId("selecionar_modo")
      .setPlaceholder("Selecione o modo da fila")
      .addOptions([
        { label: "1v1", value: "1v1" },
        { label: "2v2", value: "2v2" },
        { label: "3v3", value: "3v3" },
        { label: "4v4", value: "4v4" }
      ]);

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({ content: "Escolha o modo da fila:", components: [row], ephemeral: true });
  }

  // ===== SELECT MENU =====
  if (interaction.isSelectMenu() && interaction.customId === "selecionar_modo") {
    const modoEscolhido = interaction.values[0];
    await interaction.update({ content: `✅ Painel criado no modo **${modoEscolhido}**!`, components: [] });

    // Cria cada fila com delay
    for (const valor of valores) {
      const filaId = `fila_${valor}_${Date.now()}`;
      filas[filaId] = [];
      modosFilas[filaId] = modoEscolhido;

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`🎮 Fila R$${valor}`)
        .setDescription(`💰 Valor: ${valor}\nModo: ${modoEscolhido}\n👥 Jogadores (0/2):\nNenhum jogador na fila`);

      const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`entrar_infinito_${filaId}`)
          .setLabel("GEL INFINITO")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`entrar_normal_${filaId}`)
          .setLabel("GEL NORMAL")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`sair_${filaId}`)
          .setLabel("SAIR")
          .setStyle(ButtonStyle.Danger)
      );

      const mensagem = await interaction.channel.send({ embeds: [embed], components: [botoes] });
      mensagensFilas[filaId] = mensagem;

      // Espera 2 segundos antes de criar a próxima fila
      await sleep(2000);
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {
    const [acao, modoOuNada, filaId] = interaction.customId.split("_");
    const fila = filas[filaId];
    if (!fila) return;

    // SAIR
    if (acao === "sair") {
      filas[filaId] = fila.filter(id => id !== interaction.user.id);
      await interaction.reply({ content: "Você saiu da fila.", ephemeral: true });
      return atualizarEmbed(filaId);
    }

    // Entrar na fila
    if (acao === "entrar") {
      if (fila.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está na fila.", ephemeral: true });

      if (fila.length >= 2)
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });

      fila.push(interaction.user.id);
      await interaction.reply({ content: `Você entrou na fila (${modoOuNada.toUpperCase()})!`, ephemeral: true });
      atualizarEmbed(filaId);

      // Cria canal privado quando 2 players entram
      if (fila.length === 2) {
        const guild = interaction.guild;
        const canal = await guild.channels.create({
          name: `partida-${Date.now()}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[0], allow: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[1], allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        const finalizarBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`finalizar_partida_${fila[0]}_${fila[1]}`)
            .setLabel("Finalizar Partida")
            .setStyle(ButtonStyle.Danger)
        );

        await canal.send({
          content: `🔥 Partida iniciada!\nModo: ${modoOuNada.toUpperCase()}\n<@${fila[0]}> vs <@${fila[1]}>`,
          components: [finalizarBtn]
        });

        filas[filaId] = [];
        atualizarEmbed(filaId);
      }
    }

    // Finalizar partida
    if (interaction.customId.startsWith("finalizar_partida")) {
      const [_, player1, player2] = interaction.customId.split("_");
      if (![player1, player2].includes(interaction.user.id)) {
        return interaction.reply({ content: "❌ Apenas jogadores podem finalizar.", ephemeral: true });
      }

      await interaction.reply("✅ Partida finalizada! Canal será apagado em 5 segundos.");
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }
});

client.login(TOKEN);
