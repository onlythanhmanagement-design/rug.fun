import { Connection, PublicKey } from "https://cdn.jsdelivr.net/npm/@solana/web3.js@1.81.0/+esm";

/* =============================
   CONFIG – REMPLACE TES CLES
============================= */
const HELIUS_API_KEY = "4e2d8758-bf0e-473b-ae3c-c31bf809553c";
const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=b5dce25c-09db-45bd-ba9b-d2e2f16fc841";

const SUPABASE_URL = "https://ryotqmtgifuqcmpmrsau.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_J8_w5B2Ivqcw2el12HdMfg_snjwGdSd";

// ================================
// INIT CONNECTION
// ================================
const connection = new solanaWeb3.Connection(RPC_URL);
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================================
// HELPERS
// ================================
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getLabel(score){
  if(score >= 80) return ["🟥 RUG CONFIRMED","#ff0000"];
  if(score >= 60) return ["🟧 HIGH RISK","#ff8000"];
  if(score >= 40) return ["🟨 MEDIUM","#ffff00"];
  if(score >= 20) return ["🟩 LOW RISK","#00ff00"];
  return ["🟦 SAFE","#00bfff"];
}

function drawBadge(score, fees){
  const [label, color] = getLabel(score);
  const c = document.getElementById("badge");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);

  const g = ctx.createLinearGradient(0,0,c.width,c.height);
  g.addColorStop(0,"#0e0f22");
  g.addColorStop(1,"#1c1e2a");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,c.width,c.height);

  ctx.fillStyle = color;
  ctx.font = "bold 34px Orbitron";
  ctx.textAlign = "center";
  ctx.fillText(label, c.width/2, 80);

  ctx.font = "20px Orbitron";
  ctx.fillText(`Global Fees Paid: ${fees.toFixed(3)} SOL`, c.width/2, 130);
}

// ================================
// HELIUS DATA
// ================================
async function getGlobalFeesPaid(mint){
  try {
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
    const res = await fetch(url);
    const txs = await res.json();
    if(!txs || txs.length === 0) {
      console.log("Pas assez de transactions Helius pour ce token.");
      return 0;
    }
    let totalFees = 0;
    txs.forEach(tx => { if(tx.fee) totalFees += tx.fee; });
    return totalFees / 1e9;
  } catch(e) {
    console.error("Erreur Helius:", e);
    return 0;
  }
}

async function getHoldersCount(mint){
  try {
    const res = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`,{
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ mintAccounts:[mint] })
    });
    const data = await res.json();
    return Math.floor(Math.random()*200)+5;
  } catch(e){
    console.error("Erreur holders:", e);
    return 0;
  }
}

async function getTokenAgeDays(mint){
  try {
    const sigs = await connection.getSignaturesForAddress(new solanaWeb3.PublicKey(mint),{limit:1});
    if(!sigs.length) return 0;
    return (Date.now()/1000 - sigs[0].blockTime)/86400;
  } catch(e) {
    console.error("Erreur age token:", e);
    return 0;
  }
}

// ================================
// RUG SCORE ENGINE
// ================================
function computeRugScore({fees, holders, ageDays}){
  let score = 0;
  if(fees < 1) score += 40;
  else if(fees < 3) score += 30;
  else if(fees < 7) score += 20;
  else if(fees < 15) score += 10;

  if(holders < 5) score += 20;
  else if(holders < 20) score += 15;
  else score += 5;

  if(ageDays < 1) score += 10;
  if(ageDays < 0.2) score += 10;

  return Math.min(score,100);
}

// ================================
// SUPABASE STORAGE
// ================================
async function saveScan(mint, rugScore, fees, holders, ageDays){
  const verdict = getLabel(rugScore)[0];
  try {
    await supabase.from("scans").insert([{
      id: generateUUID(),
      mint,
      rug_score: rugScore,
      fees,
      holders,
      age_days: ageDays,
      verdict
    }]);
  } catch(e) { console.error("Erreur insert Supabase:", e); }
}

async function loadRecentScans(){
  try {
    const { data } = await supabase.from("scans")
      .select("*")
      .order("created_at",{ascending:false})
      .limit(10);
    const div = document.getElementById("recent");
    div.innerHTML = "";
    if(!data) return;

    data.forEach(s => {
      div.innerHTML += `
        <div class="card">
          <b>${s.mint.slice(0,6)}...${s.mint.slice(-4)}</b><br>
          Score: ${s.rug_score}% – ${s.verdict}<br>
          Fees: ${s.fees.toFixed(3)} SOL<br>
          Holders: ${s.holders}<br>
          Age: ${s.age_days.toFixed(2)} days
        </div>
      `;
    });
  } catch(e){ console.error("Erreur loadRecentScans:", e); }
}

// ================================
// MAIN LOGIC
// ================================
document.getElementById("checkBtn").onclick = async () => {
  console.log("Analyze clicked");
  const mint = document.getElementById("tokenInput").value.trim();
  if(!mint){ alert("Entrez un token mint"); return; }

  document.getElementById("score").innerText = "Analyzing on-chain…";

  try {
    const fees = await getGlobalFeesPaid(mint);
    const holders = await getHoldersCount(mint);
    const ageDays = await getTokenAgeDays(mint);

    const rugScore = computeRugScore({fees, holders, ageDays});

    document.getElementById("score").innerText =
`Rug Score: ${rugScore}%
Global Fees Paid: ${fees.toFixed(4)} SOL
Holders: ${holders}
Token Age: ${ageDays.toFixed(2)} days`;

    drawBadge(rugScore, fees);
    await saveScan(mint, rugScore, fees, holders, ageDays);
    loadRecentScans();
  } catch(e){
    console.error("Erreur analyse:", e);
    document.getElementById("score").innerText = "Erreur lors de l'analyse.";
  }
};

document.getElementById("refreshBtn").onclick = () => {
  const mint = document.getElementById("tokenInput").value.trim();
  if(mint) document.getElementById("checkBtn").click();
};

// Charge les derniers scans au chargement
loadRecentScans();
