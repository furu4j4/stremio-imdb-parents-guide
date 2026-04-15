import cheerio from 'cheerio';

const manifest = {
  id: "org.stremio.imdbparentsguide",
  version: "1.0.0",
  name: "IMDb Parents Guide",
  description: "Adds full IMDb Parents Guide (Sex & Nudity, Violence, Profanity, etc.) directly into the Stremio description.",
  resources: ["meta"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/512px-IMDB_Logo_2016.svg.png",
  background: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/512px-IMDB_Logo_2016.svg.png"
};

async function getParentsGuide(type, id) {
  const url = `https://www.imdb.com/title/${id}/parentalguide`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Accept": "text/html",
    "Accept-Language": "en-US,en;q=0.9"
  };

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`IMDb returned ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  let certification = "";
  $("p").each((_, el) => {
    const text = $(el).text();
    if (text.includes("Motion Picture Rating (MPA)") || text.includes("Rated ")) {
      certification = text.trim();
      return false;
    }
  });

  const sections = [];
  $(".ipc-section.parental-guide-section").each((_, el) => {
    const $section = $(el);
    const title = $section.find('h3[data-testid="parental-guide-section-heading"]').text().trim() ||
                  $section.find("h3").first().text().trim();

    if (!["Sex & Nudity", "Violence & Gore", "Profanity", "Alcohol, Drugs & Smoking", "Frightening & Intense Scenes"].some(s => title.includes(s))) return;

    const severity = $section.find(".severity").first().text().trim() || "N/A";
    const voteText = $section.find(".vote-count").first().text().trim() || "";
    const items = $section.find(".item-description").map((_, item) => $(item).text().trim()).get().filter(Boolean);

    let spoilers = [];
    const spoilersSection = $section.find(".spoilers-section");
    if (spoilersSection.length) {
      spoilers = spoilersSection.find(".item-description").map((_, item) => $(item).text().trim()).get().filter(Boolean);
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

  return { id, type, description: desc };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === "/manifest.json" || pathname === "/") {
    return res.status(200).json(manifest);
  }

  if (pathname.startsWith("/meta/")) {
    const parts = pathname.replace("/meta/", "").replace(".json", "").split("/");
    const type = parts[0];
    const id = parts[1];

    if (!["movie", "series"].includes(type) || !id?.startsWith("tt")) {
      return res.status(404).json({});
    }

    try {
      const meta = await getParentsGuide(type, id);
      return res.status(200).json(meta);
    } catch (err) {
      console.error(err);
      return res.status(200).json({
        id, type,
        description: "⚠️ Could not load IMDb Parents Guide right now. Please try again later."
      });
    }
  }

  res.status(404).send("Not found");
}
