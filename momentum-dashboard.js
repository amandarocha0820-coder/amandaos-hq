(() => {
  function weekProgressSnapshot(){
    const routines=store.get("routineTasks");
    const completed=store.getObj("routineCompletions",{});
    const monday=startOfWeek();
    const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const occurrences=[];

    routines.forEach(task=>{
      if(task.schedule==="Daily"){
        weekdays.forEach((_,index)=>{
          const date=new Date(monday); date.setDate(monday.getDate()+index);
          const dateKey=dateKeyFromDate(date);
          if(dateKey<MOMENTUM_START_DATE) return;
          const key=`${dateKey}:${task.id}`;
          occurrences.push({key,done:!!completed[key]});
        });
      }else if(task.schedule==="Weekly"){
        const weekKey=dateKeyFromDate(monday);
        const key=`${weekKey}:weekly:${task.id}`;
        occurrences.push({key,done:!!completed[key]});
      }else{
        const index=weekdays.indexOf(task.schedule);
        if(index<0) return;
        const date=new Date(monday); date.setDate(monday.getDate()+index);
        const dateKey=dateKeyFromDate(date);
        if(dateKey<MOMENTUM_START_DATE) return;
        const key=`${dateKey}:${task.id}`;
        occurrences.push({key,done:!!completed[key]});
      }
    });

    const total=occurrences.length;
    const done=occurrences.filter(x=>x.done).length;
    const percent=total?Math.round(done/total*100):0;
    return {total,done,percent};
  }

  function renderSingleWeeklyBar(){
    const trend=document.getElementById("dailyTaskTrend");
    if(!trend) return;
    const {total,done,percent}=weekProgressSnapshot();
    const trendCard=trend.closest(".momentum-trend");
    if(trendCard){
      const label=trendCard.querySelector(".card-label");
      const heading=trendCard.querySelector("h4");
      const helper=trendCard.querySelector(".trend-heading > span");
      if(label) label.textContent="WEEKLY PROGRESS";
      if(heading) heading.textContent="This week";
      if(helper) helper.textContent="Reach 80% to earn your weekly reward";
    }

    trend.innerHTML=`
      <div class="weekly-progress-row">
        <div class="weekly-progress-meta">
          <span>${done} of ${total} completed</span>
          <strong>${percent}%</strong>
        </div>
        <div class="weekly-progress-track" role="progressbar" aria-label="Weekly progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <i style="width:${Math.min(percent,100)}%"></i>
          <span class="weekly-goal-marker" title="80% goal"></span>
        </div>
        <small>${percent>=80?"🎉 Weekly goal reached — reward earned!":"80% unlocks your weekly reward"}</small>
      </div>`;
  }

  const originalRenderMomentum=window.renderMomentum;
  if(typeof originalRenderMomentum==="function"){
    window.renderMomentum=function(){
      originalRenderMomentum();
      renderSingleWeeklyBar();
    };
  }

  const style=document.createElement("style");
  style.textContent=`
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

  if(typeof window.renderMomentum==="function") window.renderMomentum();
})();
