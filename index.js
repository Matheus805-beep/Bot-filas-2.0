require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  Routes,
  REST
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const valores = [100, 50, 20, 10, 5, 2, 1];

let filas = {};
let mensagensFilas = {};
let modoPorServidor = {};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================= REGISTRAR SLASH GLOBAL =================
const commands = [
  new SlashCommandBuilder()
    .setName("criarpainel")
    .setDescription("Criar painel de filas (Admin)")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
})();

client.once("ready", () => {
  console.log(`🔥 Bot Online como ${client.user.tag}`);
});

// ================= ATUALIZAR EMBED =================
async function atualizarEmbed(filaBaseId, guildId) {

  const msg = mensagensFilas[filaBaseId];
  if (!msg) return;

  const filaInfinito = filas[`${filaBaseId}_infinito`] || [];
  const filaNormal = filas[`${filaBaseId}_normal`] || [];

  const listaInfinito = filaInfinito.length
    ? filaInfinito.map(id => `<@${id}> — GEL INFINITO`).join("\n")
    : "Nenhum jogador";

  const listaNormal = filaNormal.length
    ? filaNormal.map(id => `<@${id}> — GEL NORMAL`).join("\n")
    : "Nenhum jogador";

  const valor = filaBaseId.split("_")[1];
  const modo = modoPorServidor[guildId] || "1v1";

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(`🎮 Fila R$${valor}`)
    .setDescription(
      `💰 Valor: ${valor}\n` +
      `Modo: ${modo}\n\n` +
      `🟢 GEL INFINITO (${filaInfinito.length}/2)\n${listaInfinito}\n\n` +
      `🔵 GEL NORMAL (${filaNormal.length}/2)\n${listaNormal}`
    );

  await msg.edit({ embeds: [embed] });
}

// ================= INTERAÇÕES =================
client.on("interactionCreate", async interaction => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "criarpainel") {

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ Apenas admins.", ephemeral: true });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("select_modo")
        .setPlaceholder("Escolha o modo")
        .addOptions([
          { label: "1v1", value: "1v1" },
          { label: "2v2", value: "2v2" },
          { label: "3v3", value: "3v3" },
          { label: "4v4", value: "4v4" }
        ]);

      const row = new ActionRowBuilder().addComponents(menu);

      return interaction.reply({
        content: "Selecione o modo das filas:",
        components: [row],
        ephemeral: true
      });
    }
  }

  // ===== SELECT MENU =====
  if (interaction.isStringSelectMenu()) {

    if (interaction.customId === "select_modo") {

      const guildId = interaction.guild.id;
      modoPorServidor[guildId] = interaction.values[0];

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(`✅ Criando filas no modo **${modoPorServidor[guildId]}**...`);

      for (const valor of valores) {

        const filaBaseId = `${guildId}_fila_${valor}_${Date.now()}`;

        filas[`${filaBaseId}_infinito`] = [];
        filas[`${filaBaseId}_normal`] = [];

        const embed = new EmbedBuilder()
          .setColor("Blue")
          .setTitle(`🎮 Fila R$${valor}`)
          .setDescription(
            `💰 Valor: ${valor}\n` +
            `Modo: ${modoPorServidor[guildId]}\n\n` +
            `🟢 GEL INFINITO (0/2)\nNenhum jogador\n\n` +
            `🔵 GEL NORMAL (0/2)\nNenhum jogador`
          );

        const botoes = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`entrar_infinito_${filaBaseId}`)
            .setLabel("GEL INFINITO")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`entrar_normal_${filaBaseId}`)
            .setLabel("GEL NORMAL")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(`sair_${filaBaseId}`)
            .setLabel("SAIR")
            .setStyle(ButtonStyle.Danger)
        );

        const mensagem = await interaction.channel.send({
          embeds: [embed],
          components: [botoes]
        });

        mensagensFilas[filaBaseId] = mensagem;

        await sleep(1200);
      }
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    const parts = interaction.customId.split("_");

    // SAIR
    if (parts[0] === "sair") {

      const filaBaseId = parts.slice(1).join("_");

      const infinitoId = `${filaBaseId}_infinito`;
      const normalId = `${filaBaseId}_normal`;

      filas[infinitoId] = (filas[infinitoId] || []).filter(id => id !== interaction.user.id);
      filas[normalId] = (filas[normalId] || []).filter(id => id !== interaction.user.id);

      await interaction.reply({ content: "Você saiu da fila.", ephemeral: true });

      return atualizarEmbed(filaBaseId, interaction.guild.id);
    }

    // ENTRAR
    if (parts[0] === "entrar") {

      const modoBotao = parts[1];
      const filaBaseId = parts.slice(2).join("_");

      const filaId = `${filaBaseId}_${modoBotao}`;
      const fila = filas[filaId];

      if (fila.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está nessa fila.", ephemeral: true });

      if (fila.length >= 2)
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });

      fila.push(interaction.user.id);

      await interaction.reply({
        content: `Você entrou na fila ${modoBotao.toUpperCase()}!`,
        ephemeral: true
      });

      atualizarEmbed(filaBaseId, interaction.guild.id);

      if (fila.length === 2) {

        const guild = interaction.guild;

        const canal = await guild.channels.create({
          name: `partida-${modoBotao}-${Date.now()}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[0], allow: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[1], allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        const finalizarBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`finalizar_${fila[0]}_${fila[1]}`)
            .setLabel("Finalizar Partida")
            .setStyle(ButtonStyle.Danger)
        );

        await canal.send({
          content: `🔥 Partida iniciada!\nModo: ${modoBotao.toUpperCase()}\n<@${fila[0]}> vs <@${fila[1]}>`,
          components: [finalizarBtn]
        });

        filas[filaId] = [];
        atualizarEmbed(filaBaseId, interaction.guild.id);
      }
    }

    // FINALIZAR
    if (interaction.customId.startsWith("finalizar_")) {

      const [, player1, player2] = interaction.customId.split("_");

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
