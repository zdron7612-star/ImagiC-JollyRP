

export const lorebookMethods = {
  renderMemoryLedger() {
    const session = this.getActiveSession();
    if (!session) return;

    const chunks = session.memoryChunks || [];
    const chunkCount = chunks.length;

    // Update the summary text area — show count and most-recent chunk summary
    if (this.elements.memorySummaryText) {
      if (chunkCount === 0) {
        this.elements.memorySummaryText.innerText = 'No memories stored yet. The system will automatically summarize and store memory after every 10 messages.';
      } else {
        const latest = chunks[chunkCount - 1];
        this.elements.memorySummaryText.innerText = `${chunkCount} memory chunk${chunkCount === 1 ? '' : 's'} stored.\n\nMost recent:\n${latest.summary}`;
      }
    }

    // Render Chronicle Timeline using memory chunks
    const timelineEl = document.getElementById('memory-chronicle-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = '';

      const events = [];

      events.push({
        time: new Date(session.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: 'Adventure Initiated',
        desc: 'Started conversation with active companion.',
        type: 'start'
      });

      // Each chunk becomes a timeline entry; its bullet points become sub-items
      chunks.forEach((chunk, chunkIdx) => {
        const chunkTime = new Date(chunk.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const lines = chunk.summary.split(/\r?\n/).map(l => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
        lines.forEach((line, lineIdx) => {
          events.push({
            time: lineIdx === 0 ? `Memory ${chunkIdx + 1} · ${chunkTime}` : '',
            title: lineIdx === 0 ? `Memory Chunk #${chunkIdx + 1}` : '',
            desc: line,
            type: 'fact'
          });
        });
      });

      events.forEach(ev => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.gap = '10px';
        item.style.borderLeft = '2px solid var(--accent-gold)';
        item.style.paddingLeft = '10px';
        item.style.marginLeft = '4px';
        item.style.position = 'relative';
        item.style.marginBottom = '6px';

        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.left = '-6px';
        dot.style.top = '4px';
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.borderRadius = '50%';
        dot.style.background = ev.type === 'start' ? 'var(--accent-gold)' : 'var(--text-muted)';
        dot.style.border = '2px solid var(--bg-secondary)';
        item.appendChild(dot);

        const content = document.createElement('div');
        content.style.flex = '1';
        content.innerHTML = `
          ${ev.title ? `<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--accent-gold); font-weight: bold;"><span>${ev.title}</span><span style="opacity: 0.7;">${ev.time}</span></div>` : ''}
          <div style="font-size: 11.5px; color: var(--text-light); margin-top: 2px; line-height: 1.3;">${ev.desc}</div>
        `;
        item.appendChild(content);
        timelineEl.appendChild(item);
      });

      if (events.length <= 1) {
        timelineEl.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); font-style: italic;">No memory chunks recorded yet. Memories will form automatically as your conversation grows.</div>';
      }
    }
  },

  updateActiveLedgerText(newText) {
    const session = this.getActiveSession();
    if (!session) return;
    // For backward compat keep ledger field, but also update last chunk if available
    session.ledger = newText;
    if (session.memoryChunks && session.memoryChunks.length > 0) {
      // Update last chunk summary with manual edit
      const lastChunk = session.memoryChunks[session.memoryChunks.length - 1];
      lastChunk.summary = newText;
    }
    this.saveSessions();
  },

  renderActiveLore(loreItems) {
    this.elements.memoryLedgerList.innerHTML = '';
    if (!loreItems.length) {
      this.elements.memoryLedgerList.innerHTML = '<div class="memory-ledger-item" style="border-left-color: var(--text-muted); opacity: 0.7;">No active Lorebook items matched.</div>';
      return;
    }
    
    loreItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'memory-ledger-item';
      div.textContent = item;
      this.elements.memoryLedgerList.appendChild(div);
    });
  }
};
