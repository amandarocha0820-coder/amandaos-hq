(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const KEY = 'legalDocumentationEntries';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const write = rows => localStorage.setItem(KEY, JSON.stringify(rows));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const nowLocal = () => { const d=new Date(), off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,16); };
  let pendingPhotos = [];

  function injectNav(){
    const nav = $('.sidebar nav');
    if(!nav || $('[data-view="documentation"]')) return;
    const btn=document.createElement('button');
    btn.className='nav-btn'; btn.dataset.view='documentation'; btn.innerHTML='📁 Documentation';
    const settings=$('[data-view="settings"]');
    nav.insertBefore(btn, settings || null);
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
      $('#documentation').classList.add('active-view');
      render();
    });
  }

  function injectView(){
    if($('#documentation')) return;
    const main=$('main');
    const section=document.createElement('section');
    section.id='documentation'; section.className='view';
    section.innerHTML=`
      <div class="section-heading">
        <div><p class="eyebrow">FACTUAL RECORD</p><h2>Documentation Log</h2><p class="muted">Keep incident notes, exact statements, witnesses, follow-up, and supporting photos together.</p></div>
        <div class="heading-actions"><button class="ghost-btn" id="printDocumentation">🖨️ Print</button><button class="primary-btn" id="newDocumentation">＋ New Entry</button></div>
      </div>
      <div class="documentation-toolbar card">
        <input id="documentationSearch" type="search" placeholder="Search entries…" aria-label="Search documentation entries">
        <select id="documentationStatus"><option value="all">All entries</option><option value="draft">Drafts</option><option value="finalized">Finalized</option></select>
      </div>
      <div id="documentationList" class="documentation-list"></div>`;
    main.appendChild(section);
  }

  function injectModal(){
    if($('#documentationModal')) return;
    const d=document.createElement('dialog'); d.id='documentationModal'; d.className='modal documentation-modal';
    d.innerHTML=`<form id="documentationForm" class="modal-card">
      <div class="modal-head"><div><p class="eyebrow">DOCUMENTATION LOG</p><h3 id="documentationModalTitle">New Entry</h3></div><button type="button" class="icon-btn" id="closeDocumentation">×</button></div>
      <input type="hidden" name="id">
      <div class="form-grid two-col"><label>Incident date & time<input required type="datetime-local" name="incidentAt"></label><label>Documented date & time<input readonly type="datetime-local" name="documentedAt"></label></div>
      <label>Location<input name="location" placeholder="Where did this occur?"></label>
      <label>People present<input name="peoplePresent" placeholder="Names of people present"></label>
      <label>Factual account<textarea required name="factualAccount" rows="6" placeholder="Describe what you directly saw, heard, received, or observed. Stick to specific facts."></textarea></label>
      <label>Exact statements / quotes<textarea name="exactStatements" rows="3" placeholder='Use quotation marks when recording exact words.'></textarea></label>
      <label>What we did / actions taken<textarea name="actionsTaken" rows="3"></textarea></label>
      <div class="form-grid two-col"><label>Witnesses<textarea name="witnesses" rows="2"></textarea></label><label>Follow-up / outcome<textarea name="followUp" rows="2"></textarea></label></div>
      <label class="check-row"><input type="checkbox" name="courtRelevant" checked> Potentially relevant to court/legal matter</label>
      <div class="evidence-box"><div><strong>📎 Photos / Evidence</strong><p class="muted">Add multiple photos. They stay attached to this entry on this device.</p></div><input id="documentationPhotos" type="file" accept="image/*" multiple><div id="documentationPhotoPreview" class="evidence-preview"></div></div>
      <div class="modal-actions"><button type="button" class="ghost-btn" id="cancelDocumentation">Cancel</button><button type="submit" class="ghost-btn" data-save-status="draft">Save Draft</button><button type="submit" class="primary-btn" data-save-status="finalized">Finalize Entry</button></div>
    </form>`;
    document.body.appendChild(d);
  }

  function photosToData(files){
    return Promise.all([...files].map(file=>new Promise((resolve,reject)=>{
      if(file.size>4*1024*1024){ reject(new Error(`${file.name} is over 4 MB.`)); return; }
      const reader=new FileReader();
      reader.onload=()=>resolve({id:uid(),name:file.name,type:file.type,data:reader.result,caption:''}); reader.onerror=reject; reader.readAsDataURL(file);
    })));
  }

  function renderPhotoPreview(){
    const box=$('#documentationPhotoPreview'); if(!box) return;
    box.innerHTML=pendingPhotos.map((p,i)=>`<div class="evidence-thumb"><img src="${p.data}" alt="Evidence preview"><input data-photo-caption="${i}" value="${esc(p.caption)}" placeholder="Caption / what this photo shows"><button type="button" class="danger-link" data-remove-photo="${i}">Remove</button></div>`).join('');
    box.querySelectorAll('[data-photo-caption]').forEach(input=>input.addEventListener('input',()=>pendingPhotos[Number(input.dataset.photoCaption)].caption=input.value));
    box.querySelectorAll('[data-remove-photo]').forEach(btn=>btn.addEventListener('click',()=>{pendingPhotos.splice(Number(btn.dataset.removePhoto),1);renderPhotoPreview();}));
  }

  function openEntry(entry=null){
    const form=$('#documentationForm'); form.reset(); pendingPhotos=[];
    form.elements.id.value=entry?.id || '';
    form.elements.incidentAt.value=entry?.incidentAt || nowLocal();
    form.elements.documentedAt.value=entry?.documentedAt || nowLocal();
    ['location','peoplePresent','factualAccount','exactStatements','actionsTaken','witnesses','followUp'].forEach(k=>form.elements[k].value=entry?.[k] || '');
    form.elements.courtRelevant.checked=entry?.courtRelevant ?? true;
    pendingPhotos=(entry?.photos || []).map(p=>({...p}));
    $('#documentationModalTitle').textContent=entry?'Edit Draft':'New Entry'; renderPhotoPreview(); $('#documentationModal').showModal();
  }

  function save(event){
    event.preventDefault(); const submitter=event.submitter; const status=submitter?.dataset.saveStatus || 'draft'; const form=event.currentTarget; const fd=new FormData(form);
    if(status==='finalized' && !confirm('Finalize this entry? Once finalized, AmandaOS will lock it from editing or deletion.')) return;
    const rows=read(), id=fd.get('id') || uid(), existing=rows.find(x=>x.id===id);
    if(existing?.status==='finalized') return alert('Finalized entries are locked.');
    const row={id,incidentAt:fd.get('incidentAt'),documentedAt:existing?.documentedAt || fd.get('documentedAt') || nowLocal(),location:fd.get('location'),peoplePresent:fd.get('peoplePresent'),factualAccount:fd.get('factualAccount'),exactStatements:fd.get('exactStatements'),actionsTaken:fd.get('actionsTaken'),witnesses:fd.get('witnesses'),followUp:fd.get('followUp'),courtRelevant:fd.get('courtRelevant')==='on',photos:pendingPhotos,status,finalizedAt:status==='finalized'?new Date().toISOString():null};
    const next=rows.filter(x=>x.id!==id); next.unshift(row);
    try{ write(next); }catch(err){ alert('AmandaOS could not save this entry. The attached photos may be too large for browser storage. Try fewer/smaller photos.'); return; }
    $('#documentationModal').close(); render();
  }

  function render(){
    const list=$('#documentationList'); if(!list) return;
    const q=($('#documentationSearch')?.value||'').toLowerCase(), status=$('#documentationStatus')?.value||'all';
    const rows=read().filter(x=>(status==='all'||x.status===status) && JSON.stringify(x).toLowerCase().includes(q)).sort((a,b)=>String(b.incidentAt).localeCompare(String(a.incidentAt)));
    if(!rows.length){list.innerHTML='<div class="card empty-state">No documentation entries yet.</div>';return;}
    list.innerHTML=rows.map(x=>`<article class="card documentation-entry">
      <div class="documentation-entry-head"><div><span class="status-pill ${x.status}">${x.status==='finalized'?'🔒 Finalized':'✏️ Draft'}</span><h3>${new Date(x.incidentAt).toLocaleString()}</h3><p class="muted">Documented ${new Date(x.documentedAt).toLocaleString()}${x.location?` · ${esc(x.location)}`:''}</p></div><div class="heading-actions">${x.status==='draft'?`<button class="ghost-btn" data-edit-documentation="${x.id}">Edit</button><button class="ghost-btn" data-delete-documentation="${x.id}">Delete</button>`:''}</div></div>
      <p class="documentation-account">${esc(x.factualAccount).replace(/\n/g,'<br>')}</p>
      ${x.exactStatements?`<div class="documentation-detail"><strong>Exact statements</strong><p>${esc(x.exactStatements).replace(/\n/g,'<br>')}</p></div>`:''}
      ${x.actionsTaken?`<div class="documentation-detail"><strong>Actions taken</strong><p>${esc(x.actionsTaken).replace(/\n/g,'<br>')}</p></div>`:''}
      ${x.photos?.length?`<div class="evidence-gallery">${x.photos.map(p=>`<figure><img src="${p.data}" alt="Evidence"><figcaption>${esc(p.caption||p.name)}</figcaption></figure>`).join('')}</div>`:''}
    </article>`).join('');
    list.querySelectorAll('[data-edit-documentation]').forEach(b=>b.addEventListener('click',()=>openEntry(read().find(x=>x.id===b.dataset.editDocumentation))));
    list.querySelectorAll('[data-delete-documentation]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Delete this draft entry?')){write(read().filter(x=>x.id!==b.dataset.deleteDocumentation));render();}}));
  }

  function init(){
    injectNav(); injectView(); injectModal();
    $('#newDocumentation').addEventListener('click',()=>openEntry());
    $('#closeDocumentation').addEventListener('click',()=>$('#documentationModal').close());
    $('#cancelDocumentation').addEventListener('click',()=>$('#documentationModal').close());
    $('#documentationForm').addEventListener('submit',save);
    $('#documentationPhotos').addEventListener('change',async e=>{try{pendingPhotos.push(...await photosToData(e.target.files));renderPhotoPreview();e.target.value='';}catch(err){alert(err.message);}});
    $('#documentationSearch').addEventListener('input',render); $('#documentationStatus').addEventListener('change',render);
    $('#printDocumentation').addEventListener('click',()=>window.print());
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();