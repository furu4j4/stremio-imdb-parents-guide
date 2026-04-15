const cheerio = require('cheerio');

const manifest = {
  id: "org.stremio.imdbparentsguide",
  version: "1.0.4",
  name: "IMDb Parents Guide",
  description: "Full IMDb Parents Guide in stream list (like Ratings addon)",
  resources: ["meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/512px-IMDB_Logo_2016.svg.png",
  background: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/512px-IMDB_Logo_2016.svg.png"
};

async function getParentsGuide(imdbId) {
  const url = `https://www.imdb.com/title/${imdbId}/parentalguide`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Accept": "text/html",
    "Accept-Language": "en-US,en;q=0.9"
  };

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`IMDb ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Certification
  let certification = "";
  $("h3").each((_, el) => {
    if ($(el).text().includes("Motion Picture Rating (MPA)")) {
      certification = $(el).next().text().trim();
      return false;
    }
  });

  const sections = [];
  $("h3").each((_, el) => {
    const title = $(el).text().trim();
    if (!["Sex & Nudity", "Violence & Gore", "Profanity", "Alcohol, Drugs & Smoking", "Frightening & Intense Scenes", "Violence", "Alcohol"].some(s => title.includes(s))) return;

    const $section = $(el).parent();
    const severity = $section.find(".severity-rating").first().text().trim() || "N/A";
    const voteText = $section.find(".vote-count").first().text().trim() || "";
    const items = $section.find("p, li").not(".severity-rating, .vote-count")
      .map((_, item) => $(item).text().trim())
      .get()
      .filter(Boolean);

    let spoilers = [];
    const spoilerHeading = $section.find("h3").filter((_, h) => $(h).text().includes("Spoilers"));
    if (spoilerHeading.length) {
      spoilers = spoilerHeading.nextAll("p, li")
        .map((_, item) => $(item).text().trim())
        .get()
        .filter(Boolean);
    }

    sections.push({ title, severity, voteText, items, spoilers });
  });

  let desc = "🎬 IMDb Parents Guide\n\n";
  if (certification) desc += `📋 Certification: ${certification}\n\n`;

  if (sections.length === 0) {
    desc += "No detailed parents guide information available on IMDb for this title.";
  } else {
    sections.forEach(s => {
      desc += `**${s.title}**: ${s.severity}`;
      if (s.voteText) desc += ` (${s.voteText})`;
      desc += "\n";
      s.items.forEach(item => desc += `• ${item}\n`);
      if (s.spoilers && s.spoilers.length) {
        desc += "\n**Spoilers**:\n";
        s.spoilers.forEach(sp => desc += `• ${sp}\n`);
      }
      desc += "\n";
    });
  }

  return desc;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === "/manifest.json" || pathname === "/" || pathname === "") {
    return res.status(200).json(manifest);
  }

  // Extract IMDb ID (works for both movie/tt123 and series/tt123:1:1)
  let imdbId = "";
  if (pathname.includes("/meta/") || pathname.includes("/stream/")) {
    const clean = pathname.replace("/meta/", "").replace("/stream/", "").replace(".json", "");
    const parts = clean.split("/");
    const idPart = parts[parts.length - 1] || parts[0];
    imdbId = idPart.split(":")[0];
  }

  if (pathname.startsWith("/meta/")) {
    if (!imdbId.startsWith("tt")) return res.status(404).json({});
    try {
      const description = await getParentsGuide(imdbId);
      return res.status(200).json({ id: imdbId, type: "movie", description });
    } catch (err) {
      console.error(err);
      return res.status(200).json({ id: imdbId, type: "movie", description: "⚠️ Could not load Parents Guide right now." });
    }
  }

  if (pathname.startsWith("/stream/")) {
    if (!imdbId.startsWith("tt")) return res.status(200).json({ streams: [] });

    try {
      const description = await getParentsGuide(imdbId);
      return res.status(200).json({
        streams: [{
          name: "🎬 IMDb Parents Guide",
          description: description,
          icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/512px-IMDB_Logo_2016.svg.png",
          behaviorHints: { notWebReady: true }
        }]
      });
    } catch (err) {
      console.error(err);
      return res.status(200).json({ streams: [] });
    }
  }

  res.status(404).send("Not found");
};
