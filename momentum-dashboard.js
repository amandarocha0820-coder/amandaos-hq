(() => {
  let replacing = false;

  function readWeeklyStatsFromPage(){
    const percentText = document.getElementById("momentumPercent")?.textContent || "0%";
    const doneText = document.getElementById("momentumComplete")?.textContent || "0";
    const totalText = document.getElementById("momentumTotal")?.textContent || "0";
    return {
      percent: Math.max(0, Math.min(100, Number(percentText.replace(/[^0-9.-]/g, "")) || 0)),
      done: Number(doneText.replace(/[^0-9.-]/g, "")) || 0,
      total: Number(totalText.replace(/[^0-9.-]/g, "")) || 0
    };
  }

  function updateHeading(trend){
    const card = trend.closest(".momentum-trend") || trend.parentElement;
    if (!card) return;
    const label = card.querySelector(".card-label");
    const heading = card.querySelector("h4");
    const helper = card.querySelector(".trend-heading > span");
    if (label) label.textContent = "WEEKLY PROGRESS";
    if (heading) heading.textContent = "This week";
    if (helper) helper.textContent = "Reach 80% to earn your weekly reward";
  }

  function renderWeeklyBar(){
    const trend = document.getElementById("dailyTaskTrend");
    if (!trend || replacing) return;

    const { percent, done, total } = readWeeklyStatsFromPage();
    const alreadyWeekly = trend.querySelector(".weekly-progress-row");
    const currentPercent = alreadyWeekly?.querySelector(".weekly-progress-meta strong")?.textContent;
    const currentCount = alreadyWeekly?.querySelector(".weekly-progress-meta span")?.textContent;
    const wantedCount = `${done} of ${total} completed`;
    const wantedPercent = `${percent}%`;

    updateHeading(trend);
    if (alreadyWeekly && currentPercent === wantedPercent && currentCount === wantedCount) return;

    replacing = true;
    trend.innerHTML = `
      <div class="weekly-progress-row">
        <div class="weekly-progress-meta">
          <span>${wantedCount}</span>
          <strong>${wantedPercent}</strong>
        </div>
        <div class="weekly-progress-track" role="progressbar" aria-label="Weekly progress: ${percent}% complete" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <i style="width:${percent}%"></i>
          <span class="weekly-goal-marker" aria-hidden="true"></span>
        </div>
        <small>${percent >= 80 ? "🎉 Weekly goal reached — reward earned!" : "80% unlocks your weekly reward"}</small>
      </div>`;
    replacing = false;
  }

  const style = document.createElement("style");
  style.textContent = `
    .weekly-progress-row{display:grid;gap:10px;width:100%}
    .weekly-progress-meta{display:flex;justify-content:space-between;gap:16px;align-items:center}
    .weekly-progress-meta span{color:#746b85;font-size:.92rem}
    .weekly-progress-meta strong{font-size:1.1rem}
    .weekly-progress-track{height:18px;background:#eee8f4;border-radius:999px;overflow:hidden;position:relative}
    .weekly-progress-track i{display:block;height:100%;background:#35a968;border-radius:999px;transition:width .3s ease}
    .weekly-goal-marker{position:absolute;left:80%;top:0;bottom:0;width:3px;background:#111;opacity:.7}
    .weekly-progress-row small{color:#746b85}
  `;
  document.head.appendChild(style);

  const trend = document.getElementById("dailyTaskTrend");
  if (trend) {
    const observer = new MutationObserver(() => {
      if (!replacing) queueMicrotask(renderWeeklyBar);
    });
    observer.observe(trend, { childList: true, subtree: true, characterData: true });
  }

  renderWeeklyBar();
})();
