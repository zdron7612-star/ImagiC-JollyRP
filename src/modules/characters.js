import { _formatLocaleString, safeSetItem, stripHtmlTags, escapeHTML, estimateSliders } from '../utils.js';
import { presets } from '../presets.js';
import { buildTfIdf, replacePlaceholders } from '../memory.js';

export const charactersMethods = {
  renderCharacterLists() {
    // Sidebar list (Active Cast: top 10 characters by last convo activity)
    this.renderSidebarOnly();

    // Render landing presets grid via unified filters rendering ONLY if landing screen is visible
    if (this.elements.landingScreen && this.elements.landingScreen.style.display !== 'none') {
      this.renderPresetsGrid();
    }
  },

  async renderPresetsGrid() {
    if (!this.elements.presetCardsGrid) return;
    this.elements.presetCardsGrid.innerHTML = '';
    
    const isCommunity = this.currentSource === 'community';
    const searchQuery = this.elements.globalSearchModels ? this.elements.globalSearchModels.value.toLowerCase().trim() : '';

    // Show/hide sort rows based on source (My Cast vs Community)
    const communitySortRow = document.getElementById('community-sort-row');
    if (communitySortRow) {
      communitySortRow.style.display = isCommunity ? 'flex' : 'none';
    }
    const localSortRow = document.getElementById('local-sort-row');
    if (localSortRow) {
      localSortRow.style.display = isCommunity ? 'none' : 'flex';
    }
    const localVisibilityRow = document.getElementById('local-visibility-row');
    if (localVisibilityRow) {
      localVisibilityRow.style.display = isCommunity ? 'none' : 'flex';
    }

    if (isCommunity) {
      this.elements.presetCardsGrid.innerHTML = `
        <div class="community-loading-container" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; gap: 16px;">
          <div class="premium-spinner"></div>
          <div style="color: var(--text-muted); font-size: 14px; font-family: var(--font-brand);">Scanning Chub AI Community Portal...</div>
        </div>
      `;

      const timeframeRow = document.getElementById('filter-timeframe-row');
      if (timeframeRow) timeframeRow.style.display = 'none';

      const explanation = document.getElementById('filter-explanation-text');
      if (explanation) {
        explanation.innerHTML = `<span style="color: var(--accent-gold);">★</span> Exploring live community models from Chub.ai. Content filters are active.`;
      }

      let C = 3;
      if (this.elements.presetCardsGrid) {
        const width = this.elements.presetCardsGrid.getBoundingClientRect().width || 1000;
        C = Math.max(1, Math.floor((width + 20) / 285));
      }
      const limit = (5 * C) + 1;

      if (this.communitySearchAbortController) {
        this.communitySearchAbortController.abort();
      }
      this.communitySearchAbortController = new AbortController();
      const signal = this.communitySearchAbortController.signal;

      try {
        const sortVal = this.currentCommunitySort || 'download_count';
        let apiSort = sortVal;
        
        if (sortVal === 'hidden_gems' || sortVal === 'trending_ratio') {
          apiSort = 'download_count';
        } else if (sortVal === 'high_effort_recent') {
          apiSort = 'created_at';
        }
        
        const searchVal = searchQuery;
        const pageVal = this.currentGridPage;
        const tagVal = this.currentTagFilter || '';

        const isCustomFilter = ['hidden_gems', 'high_effort_recent', 'trending_ratio'].includes(sortVal);
        const apiLimit = isCustomFilter ? 100 : limit;
        const apiPage = isCustomFilter ? Math.floor(((pageVal - 1) * limit) / apiLimit) + 1 : pageVal;

        const res = await fetch(`/api/chub/search?search=${encodeURIComponent(searchVal)}&first=${apiLimit}&page=${apiPage}&sort=${apiSort}&nsfw=${this.nsfwEnabled ? 'true' : 'false'}&topics=${encodeURIComponent(tagVal)}`, { signal });
        
        if (!res.ok) throw new Error('API server returned error status');
        
        const responseData = await res.json();
        const dataNode = responseData.data || {};
        let nodes = dataNode.nodes || [];
        let count = dataNode.count || 0;

        if (isCustomFilter) {
          if (sortVal === 'hidden_gems') {
            nodes = nodes.filter(char => {
              const dls = char.nChats || 0;
              const desc = stripHtmlTags(char.description || '');
              return dls >= 500 && dls <= 18000 && desc.length > 100;
            });
            nodes.sort((a, b) => (b.starCount || 0) - (a.starCount || 0));
          } else if (sortVal === 'high_effort_recent') {
            nodes = nodes.filter(char => {
              const desc = stripHtmlTags(char.description || '');
              const tagline = (char.tagline || '').trim();
              const tok = char.nTokens || 0;
              return desc.length > 180 && tagline.length > 0 && tok >= 200;
            });
          } else if (sortVal === 'trending_ratio') {
            nodes = nodes.filter(char => (char.nChats || 0) >= 200);
            nodes.sort((a, b) => {
              const ratioA = (a.starCount || 0) / ((a.nChats || 0) + 1);
              const ratioB = (b.starCount || 0) / ((b.nChats || 0) + 1);
              return ratioB - ratioA;
            });
          }
          
          const localPageOffset = ((pageVal - 1) * limit) % apiLimit;
          const filteredCount = nodes.length;
          nodes = nodes.slice(localPageOffset, localPageOffset + limit);
          
          // Estimate total count based on hit rate
          count = Math.max(nodes.length, Math.ceil(count * (filteredCount / apiLimit)));
        }
        
        this.communityCharacters = nodes;
        this.elements.presetCardsGrid.innerHTML = '';
        const communityFragment = document.createDocumentFragment();

        // Harvest tags from community characters for the filter bar
        const uniqueTags = new Set();
        nodes.forEach(c => {
          const tags = c.topics || [];
          tags.forEach(t => uniqueTags.add(t));
        });
        const sortedTags = Array.from(uniqueTags).sort();

        if (this.elements.tagFilterBar) {
          if (this.exploreModeActive) {
            this.elements.tagFilterBar.style.display = 'flex';
            if (this.elements.tagPillsContainer) {
              this.elements.tagPillsContainer.innerHTML = '';
              const tagFrag = document.createDocumentFragment();
              sortedTags.forEach(tag => {
                const btn = document.createElement('button');
                btn.className = `filter-pill ${this.currentTagFilter === tag ? 'active' : ''}`;
                btn.style.fontSize = '12px';
                btn.style.padding = '6px 12px';
                btn.style.textTransform = 'capitalize';
                btn.textContent = `#${tag}`;
                
                btn.addEventListener('click', () => {
                  if (this.currentTagFilter === tag) {
                    this.currentTagFilter = '';
                  } else {
                    this.currentTagFilter = tag;
                  }
                  this.currentGridPage = 1;
                  this.renderPresetsGrid();
                });
                tagFrag.appendChild(btn);
              });
              this.elements.tagPillsContainer.appendChild(tagFrag);
            }

            if (this.elements.activeTagIndicator && this.elements.activeTagText) {
              if (this.currentTagFilter) {
                this.elements.activeTagText.textContent = `#${this.currentTagFilter}`;
                this.elements.activeTagIndicator.style.display = 'inline-flex';
              } else {
                this.elements.activeTagIndicator.style.display = 'none';
              }
            }
          } else {
            this.elements.tagFilterBar.style.display = 'none';
            this.currentTagFilter = '';
          }
        }

        if (this.elements.tagCountLabel) {
          this.elements.tagCountLabel.textContent = this.currentTagFilter ? `(${nodes.length} match${nodes.length !== 1 ? 'es' : ''})` : '';
        }

        if (nodes.length === 0) {
          this.elements.presetCardsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: var(--text-muted); font-size: 14px;">
              No community companions found. Try adjusting your query or tags.
            </div>
          `;
          this.updatePaginationUi(0);
          return;
        }

        const favs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
        nodes.forEach(char => {
          const isFav = favs.some(fId => fId === `chub_${char.id}` || this.characters.some(lc => lc.id === fId && lc.creator === 'Chub.ai' && lc.avatar.includes(char.avatar_url)));
          const isNsfw = char.nsfw_image || (char.topics && char.topics.some(t => t.toLowerCase() === 'nsfw'));
          const shouldBlur = isNsfw && this.nsfwBlur;
          const charTags = char.topics || [];
          const tagsHTML = charTags.slice(0, 5).map(t => `<span class="preset-card-tag-badge">#${escapeHTML(t)}</span>`).join('');
          const downloads = char.nChats || 0;
          const stars = char.starCount || 0;
          const statsLabel = `📥 ${downloads.toLocaleString()} | ★ ${stars.toLocaleString()}`;
          const tokenCount = char.nTokens || 200;

          const card = document.createElement('div');
          card.className = 'preset-card glass-panel community-card';
          if (isNsfw) card.classList.add('nsfw-card');
          
          card.addEventListener('click', (e) => {
            if (e.target.closest('.fav-heart-btn') || e.target.closest('.preset-card-continue-btn') || e.target.closest('.nsfw-reveal-overlay')) return;
            this.openCharacterProfile(char.id);
          });

          card.innerHTML = `
            <div class="preset-card-image-wrapper">
              <img class="preset-card-bg" src="${escapeHTML(char.max_res_url || char.avatar_url)}" alt="${escapeHTML(char.name)}" loading="lazy" decoding="async">
              <div class="preset-card-gradient"></div>
              
              ${shouldBlur ? `
                <div class="nsfw-reveal-overlay" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #121214; z-index: 5; cursor: pointer; border-radius: inherit;">
                  <span class="nsfw-overlay-icon" style="font-size: 24px;">🔞</span>
                  <span class="nsfw-overlay-text" style="font-size: 11px; font-weight: bold; color: var(--accent-gold); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Click to Reveal</span>
                </div>
              ` : ''}
              
              <button class="fav-heart-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                ♥
              </button>
              
              <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.15); padding: 4px 9px; border-radius: 5px; font-size: 11.5px; font-family: var(--font-brand); color: #fff; z-index: 10; font-weight: 500;">
                ${statsLabel}
              </div>
              
              ${isNsfw ? `
                <div style="position: absolute; top: 48px; right: 10px; background: var(--accent-red); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; color: #fff; z-index: 10; text-transform: uppercase; letter-spacing: 0.5px;">
                  NSFW
                </div>
              ` : ''}
            </div>
            
            <div class="preset-card-content">
              <div class="preset-card-name">${escapeHTML(char.name)}</div>
              <div class="preset-card-tagline">${escapeHTML(char.tagline || 'No tagline provided.')}</div>
              <div class="preset-card-intro">${escapeHTML(stripHtmlTags(char.description || ''))}</div>
              
              <div class="preset-card-tags">
                ${tagsHTML}
              </div>
              
              <div class="preset-card-footer">
                <span>${tokenCount} tokens</span>
                <button class="preset-card-continue-btn">Chat →</button>
              </div>
            </div>
          `;

          const revealOverlay = card.querySelector('.nsfw-reveal-overlay');
          if (revealOverlay) {
            revealOverlay.style.transition = 'opacity 0.3s ease';
            revealOverlay.addEventListener('click', (e) => {
              e.stopPropagation();
              revealOverlay.style.opacity = '0';
              setTimeout(() => revealOverlay.style.display = 'none', 300);
            });
          }

          const favBtn = card.querySelector('.fav-heart-btn');
          if (favBtn) {
            favBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              favBtn.classList.add('pop-anim');
              favBtn.addEventListener('animationend', () => favBtn.classList.remove('pop-anim'), { once: true });

              const isAlreadyFav = favBtn.classList.contains('active');
              if (isAlreadyFav) {
                let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
                const localChar = this.characters.find(lc => lc.creator === 'Chub.ai' && lc.avatar.includes(char.avatar_url));
                const targetId = localChar ? localChar.id : `chub_${char.id}`;
                currentFavs = currentFavs.filter(id => id !== targetId);
                safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));
                favBtn.classList.remove('active');
              } else {
                favBtn.classList.add('active');
                try {
                  const importRes = await fetch('/api/chub/import-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: char.max_res_url })
                  });
                  if (!importRes.ok) throw new Error('Failed to import community card');
                  const importData = await importRes.json();
                  if (importData.success && importData.character) {
                    const newChar = importData.character;
                    this.characters.push(newChar);
                    
                    let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
                    if (!currentFavs.includes(newChar.id)) {
                      currentFavs.push(newChar.id);
                    }
                    safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));
                    this.renderCharacterLists();
                  }
                } catch (err) {
                  console.error('Failed to auto-import on favorite:', err);
                  alert('Could not download character card details from Chub AI.');
                  favBtn.classList.remove('active');
                }
              }
              this.saveData();
            });
          }

          const chatBtn = card.querySelector('.preset-card-continue-btn');
          if (chatBtn) {
            chatBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              chatBtn.disabled = true;
              chatBtn.innerHTML = `<span class="premium-spinner" style="width:12px; height:12px; border-width:2px; display:inline-block; margin:0;"></span>`;
              
              try {
                let localChar = this.characters.find(lc => lc.creator === 'Chub.ai' && lc.avatar.includes(char.avatar_url));
                if (!localChar) {
                  const importRes = await fetch('/api/chub/import-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: char.max_res_url })
                  });
                  if (!importRes.ok) throw new Error('Failed to import card');
                  const importData = await importRes.json();
                  if (importData.success && importData.character) {
                    localChar = importData.character;
                    this.characters.push(localChar);
                    this.renderCharacterLists();
                  } else {
                    throw new Error('Server import returned failure');
                  }
                }
                
                this.selectCharacter(localChar.id);
                this.showChatScreen();
              } catch (err) {
                console.error(err);
                alert('Failed to download companion: ' + err.message);
              } finally {
                chatBtn.disabled = false;
                chatBtn.textContent = 'Chat →';
              }
            });
          }

          communityFragment.appendChild(card);
        });
        
        this.elements.presetCardsGrid.appendChild(communityFragment);

        const totalPages = Math.ceil(count / limit) || 1;
        this.updatePaginationUi(totalPages);

        const countBadge = document.getElementById('filter-count-badge');
        if (countBadge) {
          countBadge.textContent = `${count.toLocaleString()} companion${count !== 1 ? 's' : ''} found`;
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Failed to query community search:', err);
        this.elements.presetCardsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: var(--accent-red); font-size: 14px; text-align: center;">
            ⚠️ Failed to query Chub AI database.<br>
            <span style="font-size: 12px; color: var(--text-muted); margin-top: 8px; display: inline-block;">Details: ${err.message}</span>
          </div>
        `;
      }
      return;
    }

    const cat = this.currentCategoryFilter;
    const timeframe = this.currentTimeframeFilter;
    
    // Get preset IDs
    const presetIds = presets.map(p => p.id);

    let list = [...this.characters];

    // NSFW content filtering for local characters
    if (!this.nsfwEnabled) {
      list = list.filter(c => {
        const isNsfw = c.nsfw || (c.tags && c.tags.some(t => t.toLowerCase() === 'nsfw'));
        return !isNsfw;
      });
    }

    const messageCountsByChar = new Map();
    Object.entries(this.sessions || {}).forEach(([charId, chats]) => {
      const total = (chats || []).reduce((sum, chat) => sum + ((chat.messages || []).length), 0);
      messageCountsByChar.set(charId, total);
    });

    // 2. Category filter
    if (cat === 'presets') {
      list = list.filter(c => presetIds.includes(c.id));
    } else if (cat === 'custom') {
      list = list.filter(c => !presetIds.includes(c.id));
    } else if (cat === 'trending') {
      list.forEach(c => {
        c._score = messageCountsByChar.get(c.id) || 0;
      });
      list.sort((a, b) => b._score - a._score);
    } else if (cat === 'favorites') {
      const favs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
      list = list.filter(c => favs.includes(c.id));
    }

    // 3. Search query filter
    if (searchQuery) {
      list = list.filter(c => {
        const name = (c.name || '').toLowerCase();
        const tagline = (c.tagline || '').toLowerCase();
        const intro = (c.description || '').toLowerCase();
        return name.includes(searchQuery) || tagline.includes(searchQuery) || intro.includes(searchQuery);
      });
    }

    // Dynamic Tags Harvesting
    const uniqueTags = new Set();
    list.forEach(c => {
      const tags = c.tags || ["Roleplay", "Anime"];
      tags.forEach(t => uniqueTags.add(t));
    });
    const sortedTags = Array.from(uniqueTags).sort();

    // Render tag filter bar
    if (this.elements.tagFilterBar) {
      if (this.exploreModeActive) {
        this.elements.tagFilterBar.style.display = 'flex';
        
        if (this.elements.tagPillsContainer) {
          this.elements.tagPillsContainer.innerHTML = '';
          const tagFrag = document.createDocumentFragment();
          sortedTags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = `filter-pill ${this.currentTagFilter === tag ? 'active' : ''}`;
            btn.style.fontSize = '12px';
            btn.style.padding = '6px 12px';
            btn.style.textTransform = 'capitalize';
            btn.textContent = `#${tag}`;
            
            btn.addEventListener('click', () => {
              if (this.currentTagFilter === tag) {
                this.currentTagFilter = '';
              } else {
                this.currentTagFilter = tag;
              }
              this.currentGridPage = 1;
              this.renderPresetsGrid();
            });
            tagFrag.appendChild(btn);
          });
          this.elements.tagPillsContainer.appendChild(tagFrag);
        }

        if (this.elements.activeTagIndicator && this.elements.activeTagText) {
          if (this.currentTagFilter) {
            this.elements.activeTagText.textContent = `#${this.currentTagFilter}`;
            this.elements.activeTagIndicator.style.display = 'inline-flex';
          } else {
            this.elements.activeTagIndicator.style.display = 'none';
          }
        }
      } else {
        this.elements.tagFilterBar.style.display = 'none';
        this.currentTagFilter = '';
      }
    }

    if (this.currentTagFilter) {
      list = list.filter(c => {
        const charTags = c.tags || ["Roleplay", "Anime"];
        return charTags.includes(this.currentTagFilter);
      });
    }

    if (this.elements.tagCountLabel) {
      this.elements.tagCountLabel.textContent = this.currentTagFilter ? `(${list.length} match${list.length !== 1 ? 'es' : ''})` : '';
    }

    const myChatsSection = document.getElementById('my-chats-section');
    const shouldHideChats = this.exploreModeActive || searchQuery || cat !== 'all';
    if (myChatsSection) {
      myChatsSection.style.display = shouldHideChats ? 'none' : 'flex';
    }

    const explanation = document.getElementById('filter-explanation-text');
    const timeframeRow = document.getElementById('filter-timeframe-row');
    if (explanation) {
      if (cat === 'trending') {
        if (timeframeRow) timeframeRow.style.display = 'flex';
        explanation.innerHTML = `<span style="color: var(--accent-gold);">★</span> Most Active shows your companions sorted by message activity count.`;
      } else {
        if (timeframeRow) timeframeRow.style.display = 'none';
        if (cat === 'favorites') {
          explanation.innerHTML = `<span style="color: var(--accent-gold);">★</span> Showing companions you marked as favorite.`;
        } else if (cat === 'presets') {
          explanation.innerHTML = `<span style="color: var(--accent-gold);">★</span> Showing default built-in preset companions.`;
        } else if (cat === 'custom') {
          explanation.innerHTML = `<span style="color: var(--accent-gold);">★</span> Showing custom and imported companions.`;
        } else {
          explanation.innerHTML = `<span style="color: var(--accent-gold);">★</span> Showing all companions matching your filters.`;
        }
      }
    }

    const countBadge = document.getElementById('filter-count-badge');
    if (countBadge) {
      countBadge.textContent = `${list.length} companion${list.length !== 1 ? 's' : ''}`;
    }

    let C = 3;
    if (this.elements.presetCardsGrid) {
      const width = this.elements.presetCardsGrid.getBoundingClientRect().width || 1000;
      C = Math.max(1, Math.floor((width + 20) / 285));
    }
    const cardsPerPage = (5 * C) + 1;
    const totalPages = Math.ceil(list.length / cardsPerPage) || 1;
    
    if (this.currentGridPage > totalPages) this.currentGridPage = totalPages;
    if (this.currentGridPage < 1) this.currentGridPage = 1;

    const startIdx = (this.currentGridPage - 1) * cardsPerPage;
    const endIdx = startIdx + cardsPerPage;
    const paginatedList = list.slice(startIdx, endIdx);

    this.updatePaginationUi(totalPages);
    
    const fragment = document.createDocumentFragment();

    const favs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
    paginatedList.forEach(char => {
      const isFav = favs.includes(char.id);
      const charTags = char.tags || ["Roleplay", "Anime"];
      const tagsHTML = charTags.map(t => `<span class="preset-card-tag-badge">#${escapeHTML(t)}</span>`).join('');

      const totalMsgs = messageCountsByChar.get(char.id) || 0;
      const chatLabel = totalMsgs > 0 ? `💬 ${totalMsgs} msg${totalMsgs !== 1 ? 's' : ''}` : `✨ New`;
      const tokenCount = char.description ? Math.ceil(char.description.length / 4) + 150 : 220;

      const isNsfw = char.nsfw || (char.tags && char.tags.some(t => t.toLowerCase() === 'nsfw'));
      const shouldBlur = isNsfw && this.nsfwBlur;

      const card = document.createElement('div');
      card.className = 'preset-card glass-panel';
      if (isNsfw) card.classList.add('nsfw-card');
      
      card.addEventListener('click', (e) => {
        if (e.target.closest('.fav-heart-btn') || e.target.closest('.preset-card-continue-btn') || e.target.closest('.nsfw-reveal-overlay')) return;
        this.openCharacterProfile(char.id);
      });

      const isPreset = ['aria', 'lyra', 'kai'].includes(char.id);
      const bgSrc = isPreset ? ((char.bgImage && char.bgImage !== 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&q=80&w=600') ? char.bgImage : char.avatar) : char.avatar;

      card.innerHTML = `
        <div class="preset-card-image-wrapper">
          <img class="preset-card-bg" src="${escapeHTML(bgSrc)}" alt="${escapeHTML(char.name)}" loading="lazy" decoding="async">
          <div class="preset-card-gradient"></div>
          
          ${shouldBlur ? `
            <div class="nsfw-reveal-overlay" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #121214; z-index: 5; cursor: pointer; border-radius: inherit;">
              <span class="nsfw-overlay-icon" style="font-size: 24px;">🔞</span>
              <span class="nsfw-overlay-text" style="font-size: 11px; font-weight: bold; color: var(--accent-gold); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Click to Reveal</span>
            </div>
          ` : ''}
          
          <button class="fav-heart-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            ♥
          </button>
          
          <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.15); padding: 4px 9px; border-radius: 5px; font-size: 11.5px; font-family: var(--font-brand); color: #fff; z-index: 10; font-weight: 500;">
            ${chatLabel}
          </div>
          
          ${isNsfw ? `
            <div style="position: absolute; top: 48px; right: 10px; background: var(--accent-red); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; color: #fff; z-index: 10; text-transform: uppercase; letter-spacing: 0.5px;">
              NSFW
            </div>
          ` : ''}
        </div>
        
        <div class="preset-card-content">
          <div class="preset-card-name">${escapeHTML(char.name)}</div>
          <div class="preset-card-tagline">${escapeHTML(stripHtmlTags(char.tagline || ''))}</div>
          <div class="preset-card-intro">${escapeHTML(stripHtmlTags(char.description || ''))}</div>
          
          <div class="preset-card-tags">
            ${tagsHTML}
          </div>
          
          <div class="preset-card-footer">
            <span>${tokenCount} tokens</span>
            <button class="preset-card-continue-btn">Chat →</button>
          </div>
        </div>
      `;

      const favBtn = card.querySelector('.fav-heart-btn');
      if (favBtn) {
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
          favBtn.classList.add('pop-anim');
          favBtn.addEventListener('animationend', () => favBtn.classList.remove('pop-anim'), { once: true });

          if (currentFavs.includes(char.id)) {
            currentFavs = currentFavs.filter(id => id !== char.id);
            favBtn.classList.remove('active');
          } else {
            currentFavs.push(char.id);
            favBtn.classList.add('active');
          }
          safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));

          if (this.profileCharacterId === char.id && this.elements.profileBtnFav) {
            if (currentFavs.includes(char.id)) {
              this.elements.profileBtnFav.classList.add('active');
            } else {
              this.elements.profileBtnFav.classList.remove('active');
            }
          }
          
          this.saveData();
          if (this.currentCategoryFilter === 'favorites') {
            setTimeout(() => {
              this.renderPresetsGrid();
            }, 350);
          }
        });
      }

      const revealOverlay = card.querySelector('.nsfw-reveal-overlay');
      if (revealOverlay) {
        revealOverlay.style.transition = 'opacity 0.3s ease';
        revealOverlay.addEventListener('click', (e) => {
          e.stopPropagation();
          revealOverlay.style.opacity = '0';
          setTimeout(() => revealOverlay.style.display = 'none', 300);
        });
      }

      const continueBtn = card.querySelector('.preset-card-continue-btn');
      if (continueBtn) {
        continueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCharacterProfile(char.id);
        });
      }

      fragment.appendChild(card);
    });
    
    this.elements.presetCardsGrid.appendChild(fragment);
  },

  filterCompanions(query) {
    // 1. Re-render presets grid using unified filtering
    this.renderPresetsGrid();

    // 2. Filter sidebar cast list
    const sidebarItems = this.elements.sidebarCharList ? this.elements.sidebarCharList.querySelectorAll('.character-item') : [];
    sidebarItems.forEach(item => {
      const name = item.querySelector('.char-name')?.textContent.toLowerCase() || '';
      const tagline = item.querySelector('.char-tagline')?.textContent.toLowerCase() || '';
      
      if (name.includes(query) || tagline.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  },

  getActivePersona(personaId = null) {
    const defaultObj = {
      id: 'persona_default',
      name: 'Default User',
      avatar: this.defaultUserAvatar,
      description: 'The user is a roleplayer participating in an interactive story.',
      personality: 'Curious, imaginative, and responsive.',
      speechQuirks: 'Speaks clearly and uses standard English.'
    };
    if (!this.personas || !Array.isArray(this.personas) || this.personas.length === 0) {
      return defaultObj;
    }
    if (personaId) {
      return this.personas.find(p => p.id === personaId) || this.personas[0] || defaultObj;
    }
    return this.personas[0] || defaultObj;
  },

  openCharacterProfile(charId) {
    let char = this.characters.find(c => c.id === charId);
    let isCommunityBot = false;
    
    if (!char) {
      char = this.communityCharacters ? this.communityCharacters.find(c => c.id === charId) : null;
      if (!char) return;
      isCommunityBot = true;
    }

    this.profileCharacterId = charId;
    this.profileIsCommunity = isCommunityBot;
    
    // Fill text and details
    this.elements.profileAvatar.src = isCommunityBot ? (char.max_res_url || char.avatar_url) : char.avatar;

    const editBtn = this.elements.profileBtnEdit;
    const deleteBtn = this.elements.profileBtnDelete;
    if (editBtn && deleteBtn) {
      if (isCommunityBot) {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
      } else {
        editBtn.style.display = 'inline-block';
        deleteBtn.style.display = 'inline-block';
      }
    }
    const nameLength = (char.name || '').length;
    if (nameLength > 50) {
      this.elements.profileName.style.fontSize = '16px';
    } else if (nameLength > 30) {
      this.elements.profileName.style.fontSize = '20px';
    } else if (nameLength > 15) {
      this.elements.profileName.style.fontSize = '23px';
    } else {
      this.elements.profileName.style.fontSize = '26px';
    }
    this.elements.profileName.textContent = char.name;
    this.elements.profileTagline.textContent = stripHtmlTags(char.tagline || 'No tagline provided.');
    // Swap check for Janitor AI cards
    let bioText = isCommunityBot ? (char.description || '') : (char.bio || char.description || '');
    let personalityText = char.personality || '';

    const isJanitor = char.creator === 'JanitorAI' || 
                      char.creator === 'Janitor AI' || 
                      (char.tagline && char.tagline.includes('JanitorAI')) ||
                      (char.bio && (char.bio.includes('Personality\n') || char.bio.includes('>**Personality:**') || char.bio.includes('**Personality:**'))) ||
                      (char.description && (char.description.includes('Personality\n') || char.description.includes('>**Personality:**') || char.description.includes('**Personality:**')));

    this.elements.profileBio.textContent = stripHtmlTags(bioText);
    
    let traits = [];
    if (isCommunityBot) {
      traits.push("Chub AI Community Bot (Import to see complete personality & prompt specifications)");
    } else {
      if (personalityText) {
        const needsHeader = !isJanitor && !personalityText.trim().toLowerCase().startsWith('personality');
        if (needsHeader) {
          traits.push(`Personality: ${stripHtmlTags(personalityText)}`);
        } else {
          traits.push(stripHtmlTags(personalityText));
        }
      }
      if (char.quirks) traits.push(`Speech Quirks: ${stripHtmlTags(char.quirks)}`);
    }
    this.elements.profilePersonality.textContent = traits.join('\n\n') || 'None defined.';
    
    // Display percentages for sliders
    const slides = isCommunityBot ? {} : (char.sliders || {});
    this.elements.profileSliderExtro.textContent = `${slides.extroversion || 50}%`;
    this.elements.profileSliderChaos.textContent = `${slides.chaos || 50}%`;
    this.elements.profileSliderWarmth.textContent = `${slides.warmth || 50}%`;
    this.elements.profileSliderIntel.textContent = `${slides.intelligence || 50}%`;

    // Set favorite heart active state
    const favs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
    const localImported = this.characters.find(lc => lc.creator === 'Chub.ai' && lc.avatar.includes(char.avatar_url || ''));
    const targetId = isCommunityBot ? (localImported ? localImported.id : `chub_${char.id}`) : charId;
    const isFav = favs.includes(targetId);

    if (this.elements.profileBtnFav) {
      if (isFav) {
        this.elements.profileBtnFav.classList.add('active');
      } else {
        this.elements.profileBtnFav.classList.remove('active');
      }
    }

    // Ensure session exists list is set but DO NOT automatically create a default conversation!
    if (!isCommunityBot) {
      if (!this.sessions[charId] || !Array.isArray(this.sessions[charId])) {
        this.sessions[charId] = [];
      }
    }

    this.populatePersonaDropdowns();
    this.renderProfileChats();
    this.toggleModal('profileModal', true);
  },

  renderProfileChats() {
    const container = this.elements.profileChatsList;
    if (!container) return;
    container.innerHTML = '';
    
    if (this.profileIsCommunity) {
      const char = this.communityCharacters ? this.communityCharacters.find(c => c.id === this.profileCharacterId) : null;
      container.innerHTML = `
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px; align-items: center; justify-content: center; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-muted);">
          <div style="text-align: center; font-size: 12.5px; color: var(--text-muted); line-height: 1.5;">
            You haven't chatted with this community companion yet. Click below to add it to your local cast and open the interface!
          </div>
          <button class="btn btn-primary" id="profile-community-import-btn" style="width: 100%; justify-content: center; padding: 12px 24px; font-weight: bold; gap: 8px;">
            ✨ Import & Chat
          </button>
        </div>
      `;
      
      const importBtn = document.getElementById('profile-community-import-btn');
      if (importBtn && char) {
        importBtn.addEventListener('click', async () => {
          importBtn.disabled = true;
          importBtn.innerHTML = `<span class="premium-spinner" style="width:14px; height:14px; display:inline-block; border-width:2px; margin:0;"></span> Importing...`;
          
          try {
            const importRes = await fetch('/api/chub/import-card', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: char.max_res_url })
            });
            if (!importRes.ok) throw new Error('Failed to import card');
            const importData = await importRes.json();
            if (importData.success && importData.character) {
              const newChar = importData.character;
              this.characters.push(newChar);
              this.renderCharacterLists();
              this.toggleModal('profileModal', false);
              this.selectCharacter(newChar.id);
              this.showChatScreen();
            } else {
              throw new Error('Server import failed');
            }
          } catch (err) {
            alert('Failed to import: ' + err.message);
            importBtn.disabled = false;
            importBtn.textContent = '✨ Import & Chat';
          }
        });
      }
      return;
    }

    const chats = this.sessions[this.profileCharacterId] || [];
    
    // Sort chats by creation/activity time (newest first)
    const sortedChats = [...chats].sort((a, b) => b.createdAt - a.createdAt);

    if (sortedChats.length === 0) {
      container.innerHTML = `<div style="padding:16px; font-size:12px; color:var(--text-muted); text-align:center;">No conversations yet. Click '+ New Chat' to begin.</div>`;
      return;
    }

    sortedChats.forEach((chat, idx) => {
      const item = document.createElement('div');
      item.className = 'character-item';
      item.style.padding = '10px 12px';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.background = 'var(--bg-tertiary)';
      item.style.border = '1px solid var(--border-muted)';
      item.style.borderRadius = 'var(--radius-sm)';
      item.style.margin = '4px 0';
      
      // Highlight last 3 chats
      if (idx < 3) {
        item.style.borderLeft = '3px solid var(--accent-gold)';
      }

      const infoDiv = document.createElement('div');
      infoDiv.style.flex = '1';
      infoDiv.style.cursor = 'pointer';
      infoDiv.style.overflow = 'hidden';
      
      const titleSpan = document.createElement('div');
      titleSpan.textContent = chat.name || "Conversation";
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.fontSize = '13.5px';
      titleSpan.style.fontWeight = '600';
      titleSpan.style.color = 'var(--text-main)';

      const dateSpan = document.createElement('div');
      const dateStr = new Date(chat.createdAt || Date.now()).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      dateSpan.textContent = `${chat.messages.length} messages • ${dateStr}`;
      dateSpan.style.fontSize = '10.5px';
      dateSpan.style.color = 'var(--text-muted)';
      dateSpan.style.marginTop = '2px';

      infoDiv.appendChild(titleSpan);
      infoDiv.appendChild(dateSpan);
      
      infoDiv.addEventListener('click', () => {
        this.toggleModal('profileModal', false);
        this.activeCharacterId = this.profileCharacterId;
        safeSetItem('jollyrp_active_char', this.profileCharacterId);
        this.activeChatId = chat.id;
        
        // Hide landing, show chat screen
        this.showChatScreen();

        const char = this.characters.find(c => c.id === this.activeCharacterId);
        this.setChatHeaderName(char.name);
        this.elements.chatHeaderAvatar.src = char.avatar;
        this.elements.chatHeaderTagline.textContent = char.tagline;

        this.renderChatThread();
        this.scheduleIdleWork(() => {
          this.renderMemoryLedger();
          this.renderCharacterLists();
          this.generateSuggestedChoices();
        }, 500);
      });

      // Rename & Delete Actions
      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '8px';
      
      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
      `;
      renameBtn.style.background = 'none';
      renameBtn.style.border = 'none';
      renameBtn.style.cursor = 'pointer';
      renameBtn.style.display = 'inline-flex';
      renameBtn.style.alignItems = 'center';
      renameBtn.style.justifyContent = 'center';
      renameBtn.style.padding = '2px';
      renameBtn.title = 'Rename Chat';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new chat name:", chat.name);
        if (newName && newName.trim()) {
          chat.name = newName.trim();
          this.saveSessions();
          this.renderProfileChats();
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-crimson);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      `;
      deleteBtn.style.background = 'none';
      deleteBtn.style.border = 'none';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.style.alignItems = 'center';
      deleteBtn.style.justifyContent = 'center';
      deleteBtn.style.padding = '2px';
      deleteBtn.title = 'Delete Chat';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCustomConfirmDelete(
          "Delete this conversation?",
          "This will permanently delete this conversation and all its chat history.",
          async () => {
            const charId = this.profileCharacterId;
            const sessionId = chat.id;
            this.sessions[charId] = chats.filter(c => c.id !== sessionId);
            // Update localStorage immediately
            safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
            // Explicitly call DELETE endpoint
            try {
              await fetch(`/api/chats/${encodeURIComponent(charId)}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
            } catch (err) {
              console.warn('DELETE /api/chats failed:', err);
            }
            this.renderProfileChats();
            if (this.activeChatId === sessionId) {
              this.activeChatId = '';
            }
          }
        );
      });

      actionsDiv.appendChild(renameBtn);
      actionsDiv.appendChild(deleteBtn);

      item.appendChild(infoDiv);
      item.appendChild(actionsDiv);
      container.appendChild(item);
    });
  },

  selectCharacter(charId) {
    if (this.activeStreamController) {
      this.activeStreamController.abort();
      this.activeStreamController = null;
    }

    this.activeCharacterId = charId;
    safeSetItem('jollyrp_active_char', charId);
    
    const char = this.characters.find(c => c.id === charId);
    if (!char) {
      this.showLandingScreen();
      return;
    }

    // Hide landing, show chat
    this.showChatScreen();

    // Update active indicators
    this.setChatHeaderName(char.name);
    this.elements.chatHeaderAvatar.src = char.avatar;
    this.elements.chatHeaderTagline.textContent = char.tagline;

    if (!this.sessions[charId] || !Array.isArray(this.sessions[charId])) {
      if (this.sessions[charId] && this.sessions[charId].messages) {
        // Migrate single session to array
        const oldSession = this.sessions[charId];
        // Migrate old flat ledger as a seed chunk if present
        const seedChunks = [];
        if (oldSession.ledger && oldSession.ledger.trim()) {
          seedChunks.push({
            summary: oldSession.ledger.trim(),
            tfidf: buildTfIdf(oldSession.ledger),
            timestamp: Date.now()
          });
        }
        this.sessions[charId] = [{
          id: `chat_${Date.now()}`,
          name: "Original Conversation",
          messages: oldSession.messages || [],
          ledger: oldSession.ledger || "",
          memoryChunks: seedChunks,
          chunkCursor: oldSession.summaryCursor || 0,
          count: oldSession.count || 0,
          createdAt: Date.now()
        }];
      } else {
        this.sessions[charId] = [{
          id: `chat_${Date.now()}`,
          name: "Conversation 1",
          messages: [{ role: 'assistant', content: char.firstMessage, id: `msg_${Date.now()}` }],
          ledger: "",
          memoryChunks: [],
          chunkCursor: 0,
          count: 0,
          createdAt: Date.now()
        }];
      }
      this.saveSessions();
    }

    // Set active chat ID
    const chats = this.sessions[charId];
    let activeChat = chats.find(c => c.id === this.activeChatId);
    if (!activeChat) {
      activeChat = chats[0];
      this.activeChatId = activeChat.id;
    }

    if (activeChat && activeChat.personaId) {
      const selectPersonaEl = document.getElementById('sidebar-select-persona');
      if (selectPersonaEl) {
        selectPersonaEl.value = activeChat.personaId;
      }
    }

    // Patch any legacy messages that are missing IDs — runs once on session activation
    this.patchSessionMessageIds(activeChat);

    this.renderChatThread();
    this.renderMemoryLedger();
    this.renderSidebarOnly();
    this.renderConversationsList();
    this.generateSuggestedChoices();
  },

  openCharacterStudio() {
    this.editingCharacterId = null;
    if (this.elements.studioModalTitle) {
      this.elements.studioModalTitle.textContent = "🎭 Character Studio";
    }
    // Reset forms
    this.elements.studioName.value = '';
    this.elements.studioTagline.value = '';
    this.elements.studioAvatar.value = '';
    this.elements.studioAvatar.disabled = false;
    if (this.elements.studioAvatarFile) {
      this.elements.studioAvatarFile.value = '';
    }
    this.tempAvatarBase64 = '';

    this.elements.studioIntro.value = '';
    this.elements.studioBio.value = '';
    this.elements.studioPersonality.value = '';
    this.elements.studioQuirks.value = '';
    
    this.elements.studioSliders.extroversion.value = 50;
    this.elements.studioSliders.chaos.value = 50;
    this.elements.studioSliders.warmth.value = 50;
    this.elements.studioSliders.intelligence.value = 50;
    if (this.elements.studioTags) {
      this.elements.studioTags.value = '';
    }
    const spriteHappy = document.getElementById('studio-sprite-happy');
    const spriteSad = document.getElementById('studio-sprite-sad');
    const spriteAngry = document.getElementById('studio-sprite-angry');
    const spriteBlush = document.getElementById('studio-sprite-blush');
    const spriteSmug = document.getElementById('studio-sprite-smug');
    if (spriteHappy) spriteHappy.value = '';
    if (spriteSad) spriteSad.value = '';
    if (spriteAngry) spriteAngry.value = '';
    if (spriteBlush) spriteBlush.value = '';
    if (spriteSmug) spriteSmug.value = '';
    const studioNsfwCheckbox = document.getElementById('studio-nsfw');
    if (studioNsfwCheckbox) {
      studioNsfwCheckbox.checked = false;
    }

    // Reset AI generator fields
    if (this.elements.studioAiPrompt) this.elements.studioAiPrompt.value = '';
    if (this.elements.studioAiNsfw) this.elements.studioAiNsfw.checked = false;
    if (this.elements.studioAiStatus) {
      this.elements.studioAiStatus.style.display = 'none';
      this.elements.studioAiStatus.textContent = '';
    }
    if (this.elements.studioAiPanel) this.elements.studioAiPanel.classList.remove('generating');
    if (this.elements.btnStudioAiGenerate) {
      this.elements.btnStudioAiGenerate.disabled = false;
      this.elements.btnStudioAiGenerate.textContent = '🪄 Generate Card';
    }
    this.studioSelectedReferenceIds = [];
    if (this.elements.studioAiSelectedReferences) {
      this.elements.studioAiSelectedReferences.innerHTML = '';
    }
    if (this.elements.studioAiCreativity) {
      this.elements.studioAiCreativity.value = 50;
    }
    if (this.elements.studioAiCreativityVal) {
      this.elements.studioAiCreativityVal.textContent = '0.50';
    }
    this.populateAiReferenceDropdown();
    this.switchStudioTab('manual');
    
    this.toggleModal('studioModal', true);
  },

  editCharacter(charId) {
    const char = this.characters.find(c => c.id === charId);
    if (!char) return;

    this.editingCharacterId = charId;
    if (this.elements.studioModalTitle) {
      this.elements.studioModalTitle.textContent = "✍ Edit Character Card";
    }

    // Reset AI generator fields
    if (this.elements.studioAiPrompt) this.elements.studioAiPrompt.value = '';
    if (this.elements.studioAiNsfw) this.elements.studioAiNsfw.checked = false;
    if (this.elements.studioAiStatus) {
      this.elements.studioAiStatus.style.display = 'none';
      this.elements.studioAiStatus.textContent = '';
    }
    if (this.elements.studioAiPanel) this.elements.studioAiPanel.classList.remove('generating');
    if (this.elements.btnStudioAiGenerate) {
      this.elements.btnStudioAiGenerate.disabled = false;
      this.elements.btnStudioAiGenerate.textContent = '🪄 Generate Card';
    }
    this.studioSelectedReferenceIds = [];
    if (this.elements.studioAiSelectedReferences) {
      this.elements.studioAiSelectedReferences.innerHTML = '';
    }
    if (this.elements.studioAiCreativity) {
      this.elements.studioAiCreativity.value = 50;
    }
    if (this.elements.studioAiCreativityVal) {
      this.elements.studioAiCreativityVal.textContent = '0.50';
    }
    this.populateAiReferenceDropdown();
    this.switchStudioTab('manual');
    
    
    this.elements.studioName.value = char.name || "";
    this.elements.studioTagline.value = char.tagline || "";
    
    if (char.avatar && char.avatar.startsWith('data:image')) {
      this.elements.studioAvatar.value = "[Uploaded Custom Card PNG]";
      this.elements.studioAvatar.disabled = true;
      this.tempAvatarBase64 = char.avatar;
    } else {
      this.elements.studioAvatar.value = char.avatar || "";
      this.elements.studioAvatar.disabled = false;
      this.tempAvatarBase64 = "";
    }
    
    if (this.elements.studioAvatarFile) {
      this.elements.studioAvatarFile.value = "";
    }
    
    this.elements.studioIntro.value = char.firstMessage || "";
    this.elements.studioBio.value = char.description || "";
    this.elements.studioPersonality.value = char.personality || "";
    this.elements.studioQuirks.value = char.speechQuirks || char.speech_quirks || "";
    
    if (this.elements.studioTags) {
      this.elements.studioTags.value = char.tags ? char.tags.join(', ') : "";
    }
    
    const charSprites = char.sprites || {};
    const spriteHappy = document.getElementById('studio-sprite-happy');
    const spriteSad = document.getElementById('studio-sprite-sad');
    const spriteAngry = document.getElementById('studio-sprite-angry');
    const spriteBlush = document.getElementById('studio-sprite-blush');
    const spriteSmug = document.getElementById('studio-sprite-smug');
    if (spriteHappy) spriteHappy.value = charSprites.happy || '';
    if (spriteSad) spriteSad.value = charSprites.sad || '';
    if (spriteAngry) spriteAngry.value = charSprites.angry || '';
    if (spriteBlush) spriteBlush.value = charSprites.blush || '';
    if (spriteSmug) spriteSmug.value = charSprites.smug || '';
    
    const studioNsfwCheckbox = document.getElementById('studio-nsfw');
    if (studioNsfwCheckbox) {
      const isNsfw = char.nsfw || (char.tags && char.tags.some(t => t.toLowerCase() === 'nsfw'));
      studioNsfwCheckbox.checked = !!isNsfw;
    }
    
    const slides = char.sliders || {};
    this.elements.studioSliders.extroversion.value = slides.extroversion !== undefined ? slides.extroversion : 50;
    this.elements.studioSliders.chaos.value = slides.chaos !== undefined ? slides.chaos : 50;
    this.elements.studioSliders.warmth.value = slides.warmth !== undefined ? slides.warmth : 50;
    this.elements.studioSliders.intelligence.value = slides.intelligence !== undefined ? slides.intelligence : 50;
    
    // Render existing greetings/alternate greetings in the studio
    const container = document.getElementById('studio-greetings-container');
    if (container) {
      container.innerHTML = '';
      const greetings = char.greetings || [];
      // Always put the firstMessage as the primary intro, and additional greetings in greetings list
      greetings.forEach((greetingText, index) => {
        // Skip the very first one since it's already in the main intro box
        if (index === 0) return;
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.gap = '8px';
        wrapper.style.alignItems = 'stretch';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'textarea-field studio-greeting-item';
        textarea.style.minHeight = '60px';
        textarea.style.flex = '1';
        textarea.value = greetingText;
        wrapper.appendChild(textarea);
        
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '8px';
        delBtn.innerHTML = '🗑️';
        delBtn.addEventListener('click', () => {
          wrapper.remove();
        });
        wrapper.appendChild(delBtn);
        container.appendChild(wrapper);
      });
    }

    this.toggleModal('studioModal', true);
  },

  switchStudioTab(tab) {
    if (!this.elements.studioTabManualBtn || !this.elements.studioTabAiBtn) return;
    
    const applyAnimation = (el) => {
      if (el) {
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'tabFadeIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
      }
    };
    
    if (tab === 'manual') {
      this.elements.studioTabManualBtn.classList.add('active');
      this.elements.studioTabAiBtn.classList.remove('active');
      if (this.elements.studioTabManualContent) {
        this.elements.studioTabManualContent.style.display = 'block';
        applyAnimation(this.elements.studioTabManualContent);
      }
      if (this.elements.studioTabAiContent) this.elements.studioTabAiContent.style.display = 'none';
    } else {
      this.elements.studioTabManualBtn.classList.remove('active');
      this.elements.studioTabAiBtn.classList.add('active');
      if (this.elements.studioTabManualContent) this.elements.studioTabManualContent.style.display = 'none';
      if (this.elements.studioTabAiContent) {
        this.elements.studioTabAiContent.style.display = 'block';
        applyAnimation(this.elements.studioTabAiContent);
      }
    }
  },

  extractCharaFromPng(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
      throw new Error("Not a valid PNG file");
    }
    
    let offset = 8;
    while (offset < arrayBuffer.byteLength) {
      if (offset + 8 > arrayBuffer.byteLength) break;
      const length = view.getUint32(offset);
      const type = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );
      
      if ((type === 'tEXt' || type === 'iTXt') && offset + 8 + length <= arrayBuffer.byteLength) {
        const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
        let keyword = "";
        let i = 0;
        while (i < chunkData.length && chunkData[i] !== 0) {
          keyword += String.fromCharCode(chunkData[i]);
          i++;
        }
        
        if (keyword === 'chara') {
          let textData = "";
          if (type === 'tEXt') {
            i++; // Skip null separator
            while (i < chunkData.length) {
              textData += String.fromCharCode(chunkData[i]);
              i++;
            }
          } else {
            // iTXt
            i++; // Skip null keyword separator
            if (i < chunkData.length) {
              const compressionFlag = chunkData[i++];
              const compressionMethod = chunkData[i++];
              
              // Skip Language tag
              while (i < chunkData.length && chunkData[i] !== 0) i++;
              i++; // Skip null separator
              
              // Skip Translated keyword
              while (i < chunkData.length && chunkData[i] !== 0) i++;
              i++; // Skip null separator
              
              if (compressionFlag === 0) {
                const utf8decoder = new TextDecoder('utf-8');
                textData = utf8decoder.decode(chunkData.slice(i));
              } else {
                console.warn("Compressed iTXt chunk found.");
              }
            }
          }
          
          if (textData) {
            const decoded = atob(textData.trim());
            const bytes = new Uint8Array(decoded.length);
            for (let b = 0; b < decoded.length; b++) {
              bytes[b] = decoded.charCodeAt(b);
            }
            const decodedText = new TextDecoder('utf-8').decode(bytes);
            
            const parsed = JSON.parse(decodedText);
            return parsed.data || parsed;
          }
        }
      }
      offset += 12 + length;
    }
    throw new Error("No 'chara' metadata chunk found in PNG");
  },

  handleCardImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const parseCharacterData = (json) => {
      const name = json.name || json.char_name || '';
      const tagline = json.title || json.char_persona?.substring(0, 50) || 'Custom character';
      
      let description = json.description || json.char_description || json.char_persona || '';
      let personality = json.personality || json.char_persona || '';

      const isJanitorCard = json.creator === 'JanitorAI' || 
                           json.creator === 'Janitor AI' || 
                           (json.tagline && json.tagline.includes('JanitorAI')) ||
                           (json.description && (json.description.includes('Personality\n') || json.description.includes('>**Personality:**') || json.description.includes('**Personality:**')));

      if (isJanitorCard) {
        const temp = description;
        description = personality;
        personality = temp;
      }

      const speechQuirks = json.mes_template || '';
      const firstMessage = json.first_mes || json.char_greeting || "Hello there!";
      
      this.elements.studioName.value = name;
      this.elements.studioTagline.value = tagline;
      this.elements.studioBio.value = description;
      this.elements.studioPersonality.value = personality;
      this.elements.studioQuirks.value = speechQuirks;
      this.elements.studioIntro.value = firstMessage;
      if (this.elements.studioTags) {
        this.elements.studioTags.value = json.tags?.join(', ') || '';
      }
      
      const sprites = json.sprites || {};
      const spriteHappy = document.getElementById('studio-sprite-happy');
      const spriteSad = document.getElementById('studio-sprite-sad');
      const spriteAngry = document.getElementById('studio-sprite-angry');
      const spriteBlush = document.getElementById('studio-sprite-blush');
      const spriteSmug = document.getElementById('studio-sprite-smug');
      if (spriteHappy) spriteHappy.value = sprites.happy || '';
      if (spriteSad) spriteSad.value = sprites.sad || '';
      if (spriteAngry) spriteAngry.value = sprites.angry || '';
      if (spriteBlush) spriteBlush.value = sprites.blush || '';
      if (spriteSmug) spriteSmug.value = sprites.smug || '';
      
      const isNsfw = json.nsfw === true || json.nsfw === 'true' || 
                     (json.tags && json.tags.some(t => t.toLowerCase().includes('nsfw'))) ||
                     (json.topics && json.topics.some(t => t.toLowerCase().includes('nsfw')));
      const studioNsfwCheckbox = document.getElementById('studio-nsfw');
      if (studioNsfwCheckbox) {
        studioNsfwCheckbox.checked = !!isNsfw;
      }

      // Auto estimate / set sliders if not already present on card
      const estSliders = json.sliders || estimateSliders(json);
      this.elements.studioSliders.extroversion.value = estSliders.extroversion !== undefined ? estSliders.extroversion : 50;
      this.elements.studioSliders.chaos.value = estSliders.chaos !== undefined ? estSliders.chaos : 50;
      this.elements.studioSliders.warmth.value = estSliders.warmth !== undefined ? estSliders.warmth : 50;
      this.elements.studioSliders.intelligence.value = estSliders.intelligence !== undefined ? estSliders.intelligence : 50;
      
      alert("Character details imported successfully! Adjust settings and click Save.");
    };

    if (file.name.toLowerCase().endsWith('.png') || file.type === 'image/png') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target.result;
          const json = this.extractCharaFromPng(buffer);
          
          // Use the uploaded image as the avatar base64 automatically!
          const imgReader = new FileReader();
          imgReader.onload = (imgEvent) => {
            this.tempAvatarBase64 = imgEvent.target.result;
            this.elements.studioAvatar.value = "[Uploaded Custom Card PNG]";
            this.elements.studioAvatar.disabled = true;
          };
          imgReader.readAsDataURL(file);
          
          parseCharacterData(json);
        } catch (err) {
          alert("Error parsing PNG metadata: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          parseCharacterData(json);
        } catch (err) {
          alert("Error parsing JSON file. Make sure it is a valid Tavern Card JSON.");
        }
      };
      reader.readAsText(file);
    }
  },

  saveCharacter() {
    const name = this.elements.studioName.value.trim();
    const tagline = this.elements.studioTagline.value.trim();
    let avatar = this.elements.studioAvatar.value.trim();
    const intro = this.elements.studioIntro.value.trim();
    const bio = this.elements.studioBio.value.trim();
    const personality = this.elements.studioPersonality.value.trim();
    const quirks = this.elements.studioQuirks.value.trim();
    const tagsVal = this.elements.studioTags ? this.elements.studioTags.value.trim() : '';
    const tags = tagsVal ? tagsVal.split(',').map(t => t.trim()).filter(Boolean) : [];
    
    if (!name || !intro || !bio) {
      alert("Name, First Message, and Biography are required fields!");
      return;
    }

    // Use uploaded base64 avatar if available
    if (this.tempAvatarBase64) {
      avatar = this.tempAvatarBase64;
    }

    if (!avatar || avatar === "(Local File Uploaded)" || avatar === "[Uploaded Custom Card PNG]") {
      avatar = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=200";
    }

    const isEditing = !!this.editingCharacterId;
    const charId = isEditing ? this.editingCharacterId : ("custom_" + Date.now());
    const nsfwCheckbox = document.getElementById('studio-nsfw');

    // Compile greetings
    const greetingsList = [intro];
    const altGreetingEls = document.querySelectorAll('#studio-greetings-container .studio-greeting-item');
    altGreetingEls.forEach(el => {
      const txt = el.value.trim();
      if (txt) {
        greetingsList.push(txt);
      }
    });

    const spriteHappy = document.getElementById('studio-sprite-happy')?.value.trim() || '';
    const spriteSad = document.getElementById('studio-sprite-sad')?.value.trim() || '';
    const spriteAngry = document.getElementById('studio-sprite-angry')?.value.trim() || '';
    const spriteBlush = document.getElementById('studio-sprite-blush')?.value.trim() || '';
    const spriteSmug = document.getElementById('studio-sprite-smug')?.value.trim() || '';

    const updatedChar = {
      id: charId,
      name,
      tagline,
      avatar,
      bgImage: (avatar && !avatar.includes('images.unsplash.com')) ? avatar : "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&q=80&w=600",
      description: bio,
      personality,
      speechQuirks: quirks,
      firstMessage: intro,
      greetings: greetingsList,
      tags,
      sliders: {
        extroversion: parseInt(this.elements.studioSliders.extroversion.value),
        chaos: parseInt(this.elements.studioSliders.chaos.value),
        warmth: parseInt(this.elements.studioSliders.warmth.value),
        intelligence: parseInt(this.elements.studioSliders.intelligence.value)
      },
      sprites: {
        happy: spriteHappy,
        sad: spriteSad,
        angry: spriteAngry,
        blush: spriteBlush,
        smug: spriteSmug
      },
      lorebook: isEditing ? (this.characters.find(c => c.id === charId)?.lorebook || []) : [],
      creator: isEditing ? (this.characters.find(c => c.id === charId)?.creator || 'User') : 'User',
      nsfw: nsfwCheckbox ? nsfwCheckbox.checked : false
    };

    if (isEditing) {
      const idx = this.characters.findIndex(c => c.id === charId);
      if (idx !== -1) {
        this.characters[idx] = updatedChar;
      }
    } else {
      this.characters.push(updatedChar);
    }

    this.saveData();
    
    // Clear temp avatar upload
    this.tempAvatarBase64 = '';
    if (this.elements.studioAvatarFile) {
      this.elements.studioAvatarFile.value = '';
    }
    if (this.elements.studioTags) {
      this.elements.studioTags.value = '';
    }
    this.elements.studioAvatar.disabled = false;

    this.toggleModal('studioModal', false);
    this.renderCharacterLists();
    
    // Automatically open profile for the edited/new character
    this.openCharacterProfile(charId);
  },

  showPersonaScreen() {
    // Hide other screens
    if (this.elements.landingScreen) this.elements.landingScreen.style.display = 'none';
    if (this.elements.chatScreen) this.elements.chatScreen.style.display = 'none';
    if (this.elements.historyScreen) this.elements.historyScreen.style.display = 'none';
    
    // Show persona screen
    const personaScreen = document.getElementById('persona-screen');
    if (personaScreen) {
      personaScreen.style.display = 'flex';
    }

    const toggleSubnavBtn = document.getElementById('btn-toggle-subnav');
    if (toggleSubnavBtn) toggleSubnavBtn.style.display = 'none';
    const subnavSep = document.getElementById('subnav-sep');
    if (subnavSep) subnavSep.style.display = 'none';
    
    this.renderPersonasList();
  },

  renderPersonasList() {
    const container = document.getElementById('personas-list-container');
    if (!container) return;
    container.innerHTML = '';

    this.personas.forEach(persona => {
      const card = document.createElement('div');
      card.className = 'preset-card glass-panel';
      
      // Highlight active persona
      const selectPersonaEl = document.getElementById('sidebar-select-persona');
      const activePersonaId = selectPersonaEl ? selectPersonaEl.value : 'persona_default';
      const isActive = (persona.id === activePersonaId);
      
      if (isActive) {
        card.style.borderColor = 'var(--accent-gold)';
        card.style.boxShadow = '0 0 12px rgba(197, 168, 128, 0.35)';
      }

      card.innerHTML = `
        <div class="preset-card-image-wrapper">
          <img class="preset-card-bg" src="${persona.avatar || this.defaultUserAvatar}" alt="${persona.name}">
          <div class="preset-card-gradient"></div>
          
          <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.15); padding: 4px 9px; border-radius: 5px; font-size: 11.5px; font-family: var(--font-brand); color: #fff; z-index: 10; font-weight: 500;">
            ${isActive ? 'Active Persona ⭐️' : 'Inactive'}
          </div>
        </div>
        
        <div class="preset-card-content">
          <div class="preset-card-name">${persona.name}</div>
          <div class="preset-card-tagline" style="color: var(--accent-gold); font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;">
            ${persona.personality || 'No personality traits.'}
          </div>
          <div class="preset-card-intro">${persona.description || 'No description provided.'}</div>
          
          <div class="preset-card-tags">
            ${persona.speechQuirks ? `<span class="preset-card-tag-badge">#${persona.speechQuirks.split(',')[0].trim()}</span>` : '<span class="preset-card-tag-badge">#Standard</span>'}
          </div>
          
          <div class="preset-card-footer">
            <span style="font-size: 11.5px; color: var(--text-muted);">User Persona</span>
            <button class="preset-card-continue-btn">Configure →</button>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openPersonaEditor(persona.id);
      });

      container.appendChild(card);
    });
  },

  openPersonaEditor(personaId) {
    const modal = document.getElementById('persona-editor-modal');
    if (modal) modal.style.display = 'flex';

    const titleEl = document.getElementById('persona-editor-title');
    const nameInput = document.getElementById('persona-edit-name');
    const avatarInput = document.getElementById('persona-edit-avatar');
    const descInput = document.getElementById('persona-edit-description');
    const personalityInput = document.getElementById('persona-edit-personality');
    const quirksInput = document.getElementById('persona-edit-quirks');
    const delBtn = document.getElementById('persona-btn-delete');

    if (personaId === null) {
      // Create new mode
      this.editingPersonaId = null;
      if (titleEl) titleEl.textContent = 'Create New Persona';
      if (nameInput) nameInput.value = '';
      if (avatarInput) avatarInput.value = '';
      if (descInput) descInput.value = '';
      if (personalityInput) personalityInput.value = '';
      if (quirksInput) quirksInput.value = '';
      if (delBtn) delBtn.style.display = 'none';
    } else {
      // Edit mode
      const persona = this.personas.find(p => p.id === personaId);
      if (!persona) return;
      this.editingPersonaId = personaId;
      if (titleEl) titleEl.textContent = 'Edit Persona';
      if (nameInput) nameInput.value = persona.name || '';
      if (avatarInput) avatarInput.value = persona.avatar || '';
      if (descInput) descInput.value = persona.description || '';
      if (personalityInput) personalityInput.value = persona.personality || '';
      if (quirksInput) quirksInput.value = persona.speechQuirks || '';
      
      if (delBtn) {
        delBtn.style.display = personaId === 'persona_default' ? 'none' : 'inline-block';
      }
    }
  },

  savePersona() {
    const nameInput = document.getElementById('persona-edit-name');
    const avatarInput = document.getElementById('persona-edit-avatar');
    const descInput = document.getElementById('persona-edit-description');
    const personalityInput = document.getElementById('persona-edit-personality');
    const quirksInput = document.getElementById('persona-edit-quirks');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      alert("Persona name is required!");
      return;
    }

    const avatar = (avatarInput && avatarInput.value.trim()) 
      ? avatarInput.value.trim() 
      : this.defaultUserAvatar;
    const description = descInput ? descInput.value.trim() : '';
    const personality = personalityInput ? personalityInput.value.trim() : '';
    const speechQuirks = quirksInput ? quirksInput.value.trim() : '';

    if (this.editingPersonaId) {
      // Update existing
      const idx = this.personas.findIndex(p => p.id === this.editingPersonaId);
      if (idx !== -1) {
        this.personas[idx] = {
          id: this.editingPersonaId,
          name,
          avatar,
          description,
          personality,
          speechQuirks
        };
      }
    } else {
      // Create new
      const newId = 'persona_' + Date.now();
      this.personas.push({
        id: newId,
        name,
        avatar,
        description,
        personality,
        speechQuirks
      });
    }

    this.saveData();
    this.renderPersonasList();
    this.populatePersonaDropdowns();

    // Close Modal
    const modal = document.getElementById('persona-editor-modal');
    if (modal) modal.style.display = 'none';
  },

  deletePersona() {
    if (!this.editingPersonaId) return;
    if (this.editingPersonaId === 'persona_default') {
      alert("Cannot delete the default persona.");
      return;
    }

    if (confirm("Are you sure you want to delete this persona?")) {
      this.personas = this.personas.filter(p => p.id !== this.editingPersonaId);
      this.saveData();
      this.renderPersonasList();
      this.populatePersonaDropdowns();

      // Close Modal
      const modal = document.getElementById('persona-editor-modal');
      if (modal) modal.style.display = 'none';
    }
  },

  populatePersonaDropdowns() {
    const sidebarSelect = document.getElementById('sidebar-select-persona');
    const profileSelect = document.getElementById('profile-select-persona');

    const optsHtml = this.personas.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    if (sidebarSelect) {
      sidebarSelect.innerHTML = optsHtml;
      // Sync with active session's persona if possible
      const activeChat = this.getActiveSession();
      if (activeChat && activeChat.personaId) {
        sidebarSelect.value = activeChat.personaId;
      }
    }
    if (profileSelect) {
      profileSelect.innerHTML = optsHtml;
    }
  },

  cycleGreeting() {
    const activeChat = this.getActiveSession();
    if (!activeChat || activeChat.messages.length !== 1) return;
    const char = this.characters.find(c => c.id === this.activeCharacterId);
    if (!char || !char.greetings || char.greetings.length <= 1) return;
    
    const activePersona = this.getActivePersona(activeChat.personaId);
    const userName = activePersona.name || 'User';

    // Find current index
    const currentText = activeChat.messages[0].content;
    let currentIdx = -1;
    for (let i = 0; i < char.greetings.length; i++) {
      const replaced = this.replacePlaceholders(char.greetings[i], char.name, userName);
      if (replaced === currentText) {
        currentIdx = i;
        break;
      }
    }

    let nextIdx = currentIdx + 1;
    if (nextIdx >= char.greetings.length || nextIdx < 0) {
      nextIdx = 0;
    }
    activeChat.messages[0].content = this.replacePlaceholders(char.greetings[nextIdx], char.name, userName);
    this.saveSessions();
    this.renderChatThread();
  }
};
