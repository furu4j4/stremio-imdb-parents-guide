const cheerio = require('cheerio');

const manifest = {
  id: "org.stremio.imdbparentsguide",
  version: "1.0.5",
  name: "IMDb Parents Guide",
  description: "Family Night style Parents Guide on details page",
  resources: ["meta"],
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
  let certification = "Not Rated";
  $("p, .ipc-metadata-list__item, h3").each((_, el) => {
    const text = $(el).text();
    if (text.includes("Motion Picture Rating") || text.includes("Rated ") || text.includes("Certification")) {
      certification = text.replace(/Motion Picture Rating \(MPA\):/i, "").trim();
      return false;
    }
  });

  const sections = [];
  const sectionTitles = ["Sex & Nudity", "Violence & Gore", "Profanity", "Alcohol, Drugs & Smoking", "Frightening & Intense Scenes"];

  $("h3").each((_, el) => {
    const title = $(el).text().trim();
    const matchingTitle = sectionTitles.find(t => title.includes(t));
    if (!matchingTitle) return;

    const $section = $(el).closest(".ipc-section, .parental-guide-section");
    const severity = $section.find(".severity-rating, .severity, .ipc-rating-bar__rating").first().text().trim() || "N/A";

    const items = $section.find("p, li, .ipc-html-content-inner-div")
      .map((_, item) => $(item).text().trim())
      .get()
      .filter(text => text && !text.includes("Severity") && !text.includes("Vote"));

    sections.push({
      title: matchingTitle,
      severity: severity || "Moderate",
      items: items.slice(0, 6) // limit to avoid huge text
    });
  });

  // Build the nice Family Night style text
  let desc = `**Family Night**\n\n`;
  desc += `Rated ${certification} for epic battle scenes\n\n`;

  sections.forEach(s => {
    const emoji = {
      "Sex & Nudity": "⚤",
      "Violence & Gore": "🔪",
      "Profanity": "🗣️",
      "Alcohol, Drugs & Smoking": "🍷",
      "Frightening & Intense Scenes": "😱"
    }[s.title] || "•";

    desc += `\( {emoji} ** \){s.title}**: ${s.severity}\n`;
    s.items.forEach(item => {
      if (item.length > 5) desc += `   • ${item}\n`;
    });
    desc += "\n";
  });

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

  if (pathname.startsWith("/meta/")) {
    const parts = pathname.replace("/meta/", "").replace(".json", "").split("/");
    const type = parts[0];
    let id = parts[1] || parts[0];
    id = id.split(":")[0]; // handle series episodes

    if (!id.startsWith("tt")) {
      return res.status(404).json({});
    }

    try {
      const description = await getParentsGuide(id);
      return res.status(200).json({
        id,
        type,
        description
      });
    } catch (err) {
      console.error(err);
      return res.status(200).json({
        id,
        type,
        description: "⚠️ Could not load IMDb Parents Guide right now."
      });
    }
  }

  res.status(404).send("Not found");
};
