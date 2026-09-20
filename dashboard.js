function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function tokenizeQueryTerms(str) {
    if (!str) return [];
    const tokens = [];
    const regex = /(-?)(?:"([^"]+)"|'([^']+)'|(\S+))/g;
    let m;
    while ((m = regex.exec(str)) !== null) {
        const isNeg = m[1] === '-';
        const text = (m[2] || m[3] || m[4] || '').trim();
        if (text) {
            tokens.push({ text: text.toLowerCase(), isNeg });
        }
    }
    return tokens;
}

function getActiveSearchTerms() {
    const trimmed = (currentTitleQuery || '').trim();
    if (!trimmed || /(?:!topByYear|topbyyear)/i.test(trimmed)) return [];
    const cleaned = trimmed
        .replace(/(?:^|\s)author:(?:"[^"]+"|'[^']+'|[^\s]+)/gi, ' ')
        .replace(/(?:^|\s)journal:(?:"[^"]+"|'[^']+'|[^\s]+)/gi, ' ')
        .replace(/(?:^|\s)pmid:(?:"[^"]+"|'[^']+'|[^\s]+)/gi, ' ')
        .trim();
    if (!cleaned) return [];
    const tokens = tokenizeQueryTerms(cleaned);
    const totalChars = tokens.filter(t => !t.isNeg).reduce((sum, t) => sum + t.text.length, 0);
    if (totalChars < 3) return [];

    const posTokens = tokens.filter(t => !t.isNeg);
    const terms = [];

    if (posTokens.length > 1) {
        terms.push(posTokens.map(t => t.text).join(' '));
    }

    posTokens.forEach(pt => {
        const tText = pt.text;
        terms.push(tText);
        const subTokens = tokenizeTextTokens(tText);
        subTokens.forEach(st => {
            if (st) {
                terms.push(st);
                const stem = stripPluralSuffix(st);
                if (stem && stem !== st) terms.push(stem);
            }
        });
    });

    const cleanedParts = cleaned.split(/\s+/).filter(p => p.length > 0);
    if (cleanedParts.length >= 2) {
        for (let i = 0; i < cleanedParts.length - 1; i++) {
            const p1 = cleanedParts[i].replace(/^[+\-]/, '');
            const p2 = cleanedParts[i + 1].replace(/^[+\-]/, '');
            if (p1 && p2) {
                terms.push(`${p1} ${p2}`);
            }
        }
    }

    return Array.from(new Set(terms));
}

function highlightTextHtml(rawHtml, terms) {
    if (!rawHtml || !terms || terms.length === 0) return rawHtml;
    const sortedTerms = terms.map(t => t.trim()).filter(t => t.length > 0).sort((a, b) => b.length - a.length);
    const patterns = [];
    const isMulti = sortedTerms.some(t => t.includes(' ') || t.includes('-'));

    sortedTerms.forEach(cleanT => {
        if (cleanT.includes(' ') || cleanT.includes('-')) {
            const sub = tokenizeTextTokens(cleanT);
            if (sub.length > 0) {
                const flexEsc = sub.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_]+');
                patterns.push(flexEsc);
                patterns.push(sub.join(''));
            }
            return;
        }

        const alphaNumParts = cleanT.match(/[a-z0-9]+/gi);
        if (alphaNumParts && alphaNumParts.length > 1) {
            const flexEsc = alphaNumParts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_]*');
            patterns.push(flexEsc);
        } else if (cleanT.length >= 2 && /[a-z]/i.test(cleanT) && /\d/.test(cleanT)) {
            const m = cleanT.match(/^([a-z]+)(\d+)$/i);
            if (m) {
                const escPrefix = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escDigits = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                patterns.push(`${escPrefix}[\\s\\-_]*${escDigits}`);
            } else {
                const esc = cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                patterns.push(esc);
            }
        } else if (cleanT.length >= 3 && !/\d/.test(cleanT)) {
            const esc = cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patterns.push(esc);
            const stem = stripPluralSuffix(cleanT);
            if (stem && stem !== cleanT && stem.length >= 3) {
                const escStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                patterns.push(escStem);
            }
        } else if (cleanT.length >= 2) {
            const esc = cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patterns.push(esc);
        }
    });

    const uniquePatterns = Array.from(new Set(patterns));
    if (uniquePatterns.length === 0) return rawHtml;

    const matchRegex = new RegExp(`(?:${uniquePatterns.join('|')})`, 'gi');
    const parts = rawHtml.split(/(<[^>]+>)/g);
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0 && !parts[i].startsWith('<')) {
            parts[i] = parts[i].replace(matchRegex, '<mark class="search-highlight">$&</mark>');
        }
    }
    return parts.join('');
}

function toggleLiteratureFullscreen(enable) {
    const grid = document.getElementById('analyticsDashboardGrid');
    if (!grid) return;
    isLiteratureFullscreen = (enable !== undefined) ? enable : !isLiteratureFullscreen;

    grid.classList.toggle('fullscreen-mode', isLiteratureFullscreen);
    document.body.style.overflow = isLiteratureFullscreen ? 'hidden' : '';

    applyCurrentView();

    setTimeout(() => {
        if (scatterChartInstance) {
            scatterChartInstance.resize();
            scatterChartInstance.render();
        }
    }, 60);
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isLiteratureFullscreen) {
        toggleLiteratureFullscreen(false);
    }
});

function tokenizeTextTokens(str) {
    if (!str) return [];
    const matches = String(str).toLowerCase().match(/[a-z0-9]+/g);
    return matches || [];
}

function stripPluralSuffix(token) {
    if (!token || token.length <= 3) return token;
    if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
    if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
}

function matchTokenBidirectional(docToken, queryToken, allowPrefix = true) {
    if (docToken === queryToken) return true;

    const hasDigits = /\d/.test(queryToken) || /\d/.test(docToken);
    if (hasDigits) {
        return docToken.startsWith(queryToken);
    }

    if (allowPrefix && queryToken.length >= 3 && docToken.startsWith(queryToken)) return true;

    if (queryToken.length >= 4 && docToken.endsWith(queryToken)) return true;

    const docStem = stripPluralSuffix(docToken);
    const queryStem = stripPluralSuffix(queryToken);
    if (docStem === queryStem) return true;
    if (allowPrefix && queryStem.length >= 3 && docStem.startsWith(queryStem)) return true;
    if (queryStem.length >= 4 && docStem.endsWith(queryStem)) return true;

    return false;
}

function matchesSingleTerm(docTokensList, rawCorpus, term, isMultiTerm = false) {
    const cleanTerm = term.trim();
    if (!cleanTerm) return true;

    if (cleanTerm.includes(' ') || cleanTerm.includes('-')) {
        const subTokens = tokenizeTextTokens(cleanTerm);
        if (subTokens.length === 0) return true;
        
        const firstSub = subTokens[0];
        const restSubs = subTokens.slice(1);
        const leadPrefix = (!/\d/.test(firstSub) && firstSub.length >= 4) ? '[a-z0-9]*' : '';
        const firstEsc = firstSub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let flexPattern = `${leadPrefix}${firstEsc}`;
        if (restSubs.length > 0) {
            flexPattern += '[\\s\\-_]*' + restSubs.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_]*');
        }
        const suffix = isMultiTerm ? '\\b' : '[a-z0-9]*\\b';
        if (new RegExp(`\\b${flexPattern}${suffix}`, 'i').test(rawCorpus)) return true;

        const joined = subTokens.join('');
        if (joined.length >= 2) {
            if (docTokensList.some(docTok => docTok.startsWith(joined))) return true;
            if (!/\d/.test(joined) && joined.length >= 4 && docTokensList.some(docTok => docTok.endsWith(joined))) return true;
        }

        const allowTokenPrefix = !isMultiTerm;
        return subTokens.every(st => docTokensList.some(docTok => matchTokenBidirectional(docTok, st, allowTokenPrefix)));
    }

    if (cleanTerm.length >= 2 && /[a-z]/i.test(cleanTerm) && /\d/.test(cleanTerm)) {
        if (docTokensList.some(docTok => docTok.startsWith(cleanTerm))) return true;
        const matchParts = cleanTerm.match(/^([a-z]+)(\d+)$/i);
        if (matchParts) {
            const prefix = matchParts[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const digits = matchParts[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const splitPattern = new RegExp(`\\b${prefix}[\\s\\-_]*${digits}[a-z0-9]*\\b`, 'i');
            if (splitPattern.test(rawCorpus)) return true;
        }
        return false;
    }

    const subTokens = tokenizeTextTokens(cleanTerm);
    if (subTokens.length === 0) return true;
    const allowWordPrefix = !isMultiTerm;
    return subTokens.every(st => docTokensList.some(docTok => matchTokenBidirectional(docTok, st, allowWordPrefix)));
}

function getActiveTrialSearchTerms() {
    const rawTokens = tokenizeQueryTerms(currentTrialSearchQuery);
    const totalChars = rawTokens.filter(t => !t.isNeg).reduce((sum, t) => sum + t.text.length, 0);
    if (totalChars < 3) return [];

    const posTokens = rawTokens.filter(t => !t.isNeg);
    const { remainingTokens } = parseTrialAgeDirective(posTokens.map(t => t.text));
    const terms = [];

    if (remainingTokens.length > 1) {
        terms.push(remainingTokens.join(' '));
    }

    remainingTokens.forEach(singleT => {
        terms.push(singleT);
        const subTokens = tokenizeTextTokens(singleT);
        subTokens.forEach(st => {
            if (st) {
                terms.push(st);
                const stem = stripPluralSuffix(st);
                if (stem && stem !== st) terms.push(stem);
            }
        });
    });

    return Array.from(new Set(terms));
}

function expandTrialDetails(btn) {
    const card = btn.closest('.trial-item-card');
    if (!card) return;
    const summary = card.querySelector('.trial-summary-block');
    const extra = card.querySelector('.trial-extra-content');
    if (summary) summary.classList.add('is-expanded');
    if (extra) extra.classList.add('is-expanded');
    btn.remove();
}

function expandPaperAbstract(btn) {
    const card = btn.closest('.side-paper-item');
    if (!card) return;
    const abstractBlock = card.querySelector('.paper-abstract-block');
    if (abstractBlock) abstractBlock.classList.add('is-expanded');
    btn.remove();
}

function syncUrlParams() {
    const params = new URLSearchParams();
    if (currentTitleQuery && currentTitleQuery !== 'topbyyear:3') {
        params.set('q', currentTitleQuery);
    }
    if (!searchInAbstract) {
        params.set('scope', 'title');
    }
    if (currentMetricMode !== 'velocity') {
        params.set('metric', currentMetricMode);
    }
    if (currentReviewFilter !== 'peer-reviewed') {
        params.set('review', currentReviewFilter);
    }
    if (currentFilterType) {
        params.set('type', currentFilterType);
    }
    if (currentSideSort !== 'velocity') {
        params.set('sort', currentSideSort);
    }
    if (currentTrialSearchQuery) {
        params.set('t_q', currentTrialSearchQuery);
    }
    if (currentTrialFilterMode !== 'recruiting') {
        params.set('t_mode', currentTrialFilterMode);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
}

function restoreFromUrlParams() {
    const params = new URLSearchParams(window.location.search);

    if (params.has('q')) {
        currentTitleQuery = params.get('q');
        const searchInput = document.getElementById('scatterTitleSearch');
        if (searchInput) {
            searchInput.value = currentTitleQuery;
            dismissSearchHint();
        }
    }

    if (params.has('scope')) {
        searchInAbstract = (params.get('scope') !== 'title');
        const btnAbs = document.getElementById('btnScopeAbstract');
        const btnTitle = document.getElementById('btnScopeTitle');
        if (btnAbs && btnTitle) {
            btnAbs.classList.toggle('active', searchInAbstract);
            btnTitle.classList.toggle('active', !searchInAbstract);
        }
    }

    if (params.has('metric')) {
        const m = params.get('metric');
        if (m === 'citations' || m === 'velocity') {
            currentMetricMode = m;
            const btnVel = document.getElementById('btnMetricVelocity');
            const btnCit = document.getElementById('btnMetricCitations');
            if (btnVel && btnCit) {
                btnVel.classList.toggle('active', m === 'velocity');
                btnCit.classList.toggle('active', m === 'citations');
            }
        }
    }

    if (params.has('review')) {
        const r = params.get('review');
        if (r === 'all' || r === 'peer-reviewed') {
            currentReviewFilter = r;
            const btnPeer = document.getElementById('btnReviewPeer');
            const btnAll = document.getElementById('btnReviewAll');
            if (btnPeer && btnAll) {
                btnPeer.classList.toggle('active', r === 'peer-reviewed');
                btnAll.classList.toggle('active', r === 'all');
            }
        }
    }

    if (params.has('type')) {
        currentFilterType = params.get('type');
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const clickAttr = btn.getAttribute('onclick') || '';
            if (clickAttr.includes(`'${currentFilterType}'`)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    if (params.has('sort')) {
        const s = params.get('sort');
        if (['date_desc', 'date_asc', 'velocity', 'citations'].includes(s)) {
            currentSideSort = s;
            const sortBtnMap = {
                'date_desc': 'btnSortDateDesc',
                'date_asc': 'btnSortDateAsc',
                'velocity': 'btnSortVelocity',
                'citations': 'btnSortCitations'
            };
            Object.keys(sortBtnMap).forEach(k => {
                const btn = document.getElementById(sortBtnMap[k]);
                if (btn) btn.classList.toggle('active', k === s);
            });
        }
    }

    if (params.has('t_q')) {
        currentTrialSearchQuery = params.get('t_q');
        const tInput = document.getElementById('trialSearchInput');
        if (tInput) tInput.value = currentTrialSearchQuery;
    }

    if (params.has('t_mode')) {
        const tm = params.get('t_mode');
        if (['recruiting', 'active', 'all'].includes(tm)) {
            currentTrialFilterMode = tm;
        }
    }
}

function renderInitialTrials() {
    const container = document.getElementById('trialsCardsContainer');
    if (!container) return;
    if (!allTrialsData || allTrialsData.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No trials found.</p>';
        return;
    }

    const activeTerms = getActiveTrialSearchTerms();

    const htmlArr = allTrialsData.map(t => {
        let statusBadgeCls = 'trial-status-other';
        if (t.rec) statusBadgeCls = 'trial-status-recruiting';
        else if (t.act) statusBadgeCls = 'trial-status-active';

        const initialDisplay = t.rec ? 'flex' : 'none';
        const textCorpus = `${t.id} ${t.t} ${t.sp} ${t.ai} ${t.c} ${t.p} ${t.locAll} ${t.po} ${t.sum} ${t.crit || ''}`.toLowerCase();
        const docTokens = tokenizeTextTokens(textCorpus);
        const uniqueDocTokens = Array.from(new Set(docTokens)).join(' ');
        const nctUrl = `https://clinicaltrials.gov/study/${t.id}`;

        const displayTitle = highlightTextHtml(escapeHtml(t.t), activeTerms);
        const displaySponsor = highlightTextHtml(escapeHtml(t.sp), activeTerms);
        const displayInterventions = highlightTextHtml(escapeHtml(t.i), activeTerms);
        const displayLocations = highlightTextHtml(escapeHtml(t.loc), activeTerms);
        const displayConditions = highlightTextHtml(escapeHtml(t.c), activeTerms);
        const displaySummary = t.sum ? highlightTextHtml(escapeHtml(t.sum), activeTerms) : '';
        const displayPrimaryOutcomes = t.po ? highlightTextHtml(escapeHtml(t.po), activeTerms) : '';
        const displayCriteria = t.crit ? highlightTextHtml(escapeHtml(t.crit), activeTerms) : '';

        return `
        <div class="side-paper-item trial-item-card" data-corpus="${escapeHtml(textCorpus)}" data-tokens="${escapeHtml(uniqueDocTokens)}" data-min-age="${t.minA.toFixed(2)}" data-max-age="${t.maxA.toFixed(2)}" data-recruiting="${t.rec ? 'true' : 'false'}" data-active="${t.act ? 'true' : 'false'}" style="display: ${initialDisplay};">
            <div class="side-paper-meta-top">
                <a href="${nctUrl}" target="_blank" rel="noopener noreferrer" class="badge badge-date trial-badge-link">${t.id} ↗</a>
                <span class="badge ${statusBadgeCls}">● ${escapeHtml(t.s)}</span>
                <span class="badge badge-type">${escapeHtml(t.p)}</span>
                <span class="badge badge-date">Start: ${escapeHtml(t.sd)}</span>
                <span class="badge badge-citations">${escapeHtml(t.a)}</span>
            </div>
            <h3 class="side-paper-title trial-card-title">
                <a href="${nctUrl}" target="_blank" rel="noopener noreferrer">${displayTitle}</a>
            </h3>

            <div class="trial-meta-grid">
                <div class="trial-meta-cell">
                    <strong>Sponsor:</strong>
                    <span class="trial-meta-val" title="${escapeHtml(t.sp)}">${displaySponsor}</span>
                </div>
                <div class="trial-meta-cell">
                    <strong>Interventions:</strong>
                    <span class="trial-meta-val">${displayInterventions}</span>
                </div>
                <div class="trial-meta-cell">
                    <strong>Locations:</strong>
                    <span class="trial-meta-val" title="${escapeHtml(t.loc)}">${displayLocations}</span>
                </div>
            </div>

            ${displaySummary ? `
            <div class="trial-summary-block">
                <strong>Brief Summary:</strong> ${displaySummary}
            </div>` : ''}

            <button class="trial-btn-more" onclick="expandTrialDetails(this)">... Read more</button>

            <div class="trial-extra-content">
                <div class="trial-detail-subblock">
                    <strong>Conditions</strong>
                    ${displayConditions}
                </div>

                <div class="trial-detail-subblock">
                    <strong>All Interventions</strong>
                    ${highlightTextHtml(escapeHtml(t.ai), activeTerms)}
                </div>

                ${displayPrimaryOutcomes ? `
                <div class="trial-detail-subblock">
                    <strong>Primary Outcome(s)</strong>
                    ${displayPrimaryOutcomes}
                </div>` : ''}

                ${displayCriteria ? `
                <div class="trial-detail-subblock">
                    <strong>Eligibility Criteria</strong>
                    ${displayCriteria}
                </div>` : ''}
            </div>
        </div>`;
    });

    container.innerHTML = htmlArr.join('');
}

const COMPRESS_SPLIT_YEAR = 2005;
const COMPRESS_RATIO = 0.3333333333;
const SCATTER_COMPRESS_RATIO = COMPRESS_RATIO * 0.5;
const COMPRESS_SPLIT_MS = new Date('2005-01-01T00:00:00Z').getTime();

function mapYearToCompressedX(y) {
    if (y <= COMPRESS_SPLIT_YEAR) {
        return COMPRESS_SPLIT_YEAR - (COMPRESS_SPLIT_YEAR - y) * COMPRESS_RATIO;
    }
    return y;
}

function unmapCompressedXToYear(x) {
    if (x <= COMPRESS_SPLIT_YEAR) {
        return COMPRESS_SPLIT_YEAR - (COMPRESS_SPLIT_YEAR - x) / COMPRESS_RATIO;
    }
    return x;
}

function mapTimestampToCompressedX(ms) {
    if (ms <= COMPRESS_SPLIT_MS) {
        return COMPRESS_SPLIT_MS - (COMPRESS_SPLIT_MS - ms) * SCATTER_COMPRESS_RATIO;
    }
    return ms;
}

function unmapCompressedXToTimestamp(x) {
    if (x <= COMPRESS_SPLIT_MS) {
        return COMPRESS_SPLIT_MS - (COMPRESS_SPLIT_MS - x) / SCATTER_COMPRESS_RATIO;
    }
    return x;
}

function buildCompressedYearTicks(startYear, endYear, stepPre = 10, stepPost = 5) {
    const ticks = [];
    for (let y = Math.ceil(startYear / stepPre) * stepPre; y < COMPRESS_SPLIT_YEAR; y += stepPre) {
        if (y >= startYear && y !== 2000) ticks.push(y);
    }
    ticks.push(COMPRESS_SPLIT_YEAR);
    for (let y = COMPRESS_SPLIT_YEAR + stepPost; y <= endYear; y += stepPost) {
        ticks.push(y);
    }
    return ticks;
}

function buildDynamicScatterXTicks(minX, maxX, currentYearLimit) {
    const minMs = unmapCompressedXToTimestamp(minX);
    const maxMs = unmapCompressedXToTimestamp(maxX);
    const minYear = new Date(minMs).getUTCFullYear();
    const maxYear = new Date(maxMs).getUTCFullYear();
    const yearSpan = Math.max(1, maxYear - minYear);

    let step = 1;
    if (yearSpan > 50) step = 10;
    else if (yearSpan > 25) step = 5;
    else if (yearSpan > 10) step = 2;
    else step = 1;

    const ticks = [];
    const startY = Math.floor(minYear / step) * step;

    let lastPlacedX = -Infinity;
    const minSpacing = (maxX - minX) * 0.08;

    for (let y = startY; y <= maxYear + step; y += step) {
        if (y < 1960 || (currentYearLimit && y > currentYearLimit + 2)) continue;
        const ms = new Date(`${y}-01-01T00:00:00Z`).getTime();
        const compX = mapTimestampToCompressedX(ms);

        if (compX >= minX && compX <= maxX) {
            if (compX - lastPlacedX >= minSpacing) {
                ticks.push({ val: compX, label: String(y) });
                lastPlacedX = compX;
            }
        }
    }
    return ticks;
}

function buildDynamicYTicks(minY, maxY, isVelocity) {
    const allCandidateValues = isVelocity
        ? [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]
        : [0, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

    const candidates = allCandidateValues.map(v => ({
        v: mapYValue(v, isVelocity),
        realVal: v,
        label: v >= 1000 ? v.toLocaleString() : String(v)
    }));

    const inRange = candidates.filter(t => t.v >= minY && t.v <= maxY);
    const minSpacingY = (maxY - minY) * 0.06;
    const filteredTicks = [];
    let lastY = -Infinity;

    for (const tick of inRange) {
        if (tick.v - lastY >= minSpacingY) {
            filteredTicks.push(tick);
            lastY = tick.v;
        }
    }

    if (filteredTicks.length < 3) {
        const step = (maxY - minY) / 4;
        const fallback = [];
        for (let i = 0; i <= 4; i++) {
            const curY = minY + i * step;
            let realVal = 0;
            if (isVelocity) {
                if (curY <= 0.18) realVal = Math.max(0, (curY / 0.18) * 2.0);
                else realVal = Math.pow(10, (curY - 0.18) / 2.0 + Math.log10(2.0));
            } else {
                if (curY <= 0.20) realVal = Math.max(0, (curY / 0.20) * 10.0);
                else realVal = Math.pow(10, (curY - 0.20) + 1.0);
            }
            fallback.push({
                v: curY,
                label: realVal >= 10 ? Math.round(realVal).toLocaleString() : realVal.toFixed(1)
            });
        }
        return fallback;
    }

    return filteredTicks;
}

function scrollToScatter() {
    const scatterGrid = document.getElementById('analyticsDashboardGrid');
    if (scatterGrid && !isLiteratureFullscreen) {
        scatterGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateAgeBarHighlight() {
    if (!recruitingAgeChartInstance) return;
    const ds = recruitingAgeChartInstance.data.datasets[0];
    const labels = recruitingAgeChartInstance.data.labels;

    const bgColors = labels.map((_, idx) => {
        if (selectedAgeBarIndex === idx) {
            return 'rgba(250, 204, 21, 0.9)';
        }
        return 'rgba(56, 189, 248, 0.55)';
    });

    const borderColors = labels.map((_, idx) => {
        if (selectedAgeBarIndex === idx) {
            return '#facc15';
        }
        return '#38bdf8';
    });

    const borderWidths = labels.map((_, idx) => {
        return selectedAgeBarIndex === idx ? 2.5 : 1;
    });

    ds.backgroundColor = bgColors;
    ds.borderColor = borderColors;
    ds.borderWidth = borderWidths;
    recruitingAgeChartInstance.update('none');
}

function onTrialSearchInput(val) {
    currentTrialSearchQuery = (val || '').trim().toLowerCase();
    selectedAgeBarIndex = null;
    updateAgeBarHighlight();

    clearTimeout(trialSearchDebounce);
    trialSearchDebounce = setTimeout(() => {
        renderInitialTrials();
        filterTrialsList();
        syncUrlParams();
    }, 80);
}

function setTrialListFilter(filterMode) {
    currentTrialFilterMode = filterMode;
    filterTrialsList();
    syncUrlParams();
}

function applyTrialAgeFilter(ageInt, barIdx) {
    const searchInput = document.getElementById('trialSearchInput');
    if (!searchInput) return;
    selectedAgeBarIndex = barIdx;
    updateAgeBarHighlight();

    const existingQuery = searchInput.value.replace(/age:\S+/gi, '').trim();
    searchInput.value = existingQuery ? `${existingQuery} age:${ageInt}` : `age:${ageInt}`;
    currentTrialSearchQuery = searchInput.value.trim().toLowerCase();
    renderInitialTrials();
    filterTrialsList();
    syncUrlParams();
}

function parseTrialAgeDirective(tokens) {
    let targetMin = null;
    let targetMax = null;
    const remainingTokens = [];

    for (const t of tokens) {
        const m = t.match(/^age:([0-9\.\-+]+)$/i);
        if (m) {
            const val = m[1];
            if (val.includes('-')) {
                const parts = val.split('-');
                if (parts[0] === '') {
                    targetMin = 0.0;
                    targetMax = parseFloat(parts[1]);
                } else if (parts[1] === '') {
                    targetMin = parseFloat(parts[0]);
                    targetMax = 100.0;
                } else {
                    targetMin = parseFloat(parts[0]);
                    targetMax = 100.0;
                }
            } else if (val.endsWith('+')) {
                targetMin = parseFloat(val.replace('+', ''));
                targetMax = 100.0;
            } else {
                const exact = parseFloat(val);
                targetMin = exact;
                targetMax = exact;
            }
        } else {
            remainingTokens.push(t);
        }
    }

    return { targetMin, targetMax, remainingTokens };
}

function filterTrialsList() {
    const cards = document.querySelectorAll('.trial-item-card');
    const btnRec = document.getElementById('btnTrialsRecruiting');
    const btnActive = document.getElementById('btnTrialsActive');
    const btnAll = document.getElementById('btnTrialsAll');

    btnRec.classList.toggle('active', currentTrialFilterMode === 'recruiting');
    btnActive.classList.toggle('active', currentTrialFilterMode === 'active');
    btnAll.classList.toggle('active', currentTrialFilterMode === 'all');

    const parsedQueryTokens = tokenizeQueryTerms(currentTrialSearchQuery);
    const totalChars = parsedQueryTokens.filter(t => !t.isNeg).reduce((sum, t) => sum + t.text.length, 0);

    let posTerms = [];
    let negTerms = [];
    let isMultiTerm = false;
    let targetMin = null;
    let targetMax = null;

    if (totalChars >= 3) {
        const rawTokens = parsedQueryTokens.map(t => (t.isNeg ? '-' : '') + t.text);
        const parsedAge = parseTrialAgeDirective(rawTokens);
        targetMin = parsedAge.targetMin;
        targetMax = parsedAge.targetMax;
        posTerms = parsedAge.remainingTokens.filter(t => !t.startsWith('-'));
        negTerms = parsedAge.remainingTokens.filter(t => t.startsWith('-') && t.length > 1).map(t => t.slice(1));
        const allWordsCount = posTerms.reduce((sum, t) => sum + (tokenizeTextTokens(t).length || 1), 0);
        isMultiTerm = allWordsCount > 1;
    } else {
        const rawTokens = parsedQueryTokens.map(t => (t.isNeg ? '-' : '') + t.text);
        const parsedAge = parseTrialAgeDirective(rawTokens);
        targetMin = parsedAge.targetMin;
        targetMax = parsedAge.targetMax;
    }

    let visibleCount = 0;
    let totalRecruitingMatching = 0;
    let totalActiveMatching = 0;
    let totalAllMatching = 0;

    cards.forEach(card => {
        const tokensStr = card.dataset.tokens || '';
        const rawCorpus = card.dataset.corpus || '';
        const docTokensList = tokensStr ? tokensStr.split(' ') : [];
        const isRec = card.dataset.recruiting === 'true';
        const isAct = card.dataset.active === 'true';
        const minAge = parseFloat(card.dataset.minAge || '0');
        const maxAge = parseFloat(card.dataset.maxAge || '100');

        const matchesText = (posTerms.length === 0 && negTerms.length === 0) || (
            posTerms.every(t => matchesSingleTerm(docTokensList, rawCorpus, t, isMultiTerm)) &&
            !negTerms.some(t => matchesSingleTerm(docTokensList, rawCorpus, t, isMultiTerm))
        );

        let matchesAge = true;
        if (targetMin !== null && targetMax !== null) {
            matchesAge = (minAge <= targetMax && maxAge >= targetMin);
        }

        const matchesSearch = matchesText && matchesAge;

        if (matchesSearch) {
            totalAllMatching++;
            if (isRec) totalRecruitingMatching++;
            if (isAct) totalActiveMatching++;
        }

        let matchesMode = false;
        if (currentTrialFilterMode === 'recruiting') {
            matchesMode = isRec;
        } else if (currentTrialFilterMode === 'active') {
            matchesMode = isAct;
        } else {
            matchesMode = true;
        }

        if (matchesSearch && matchesMode) {
            card.style.display = 'flex';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    btnRec.innerText = `Recruiting Only (${totalRecruitingMatching})`;
    btnActive.innerText = `All Active (${totalActiveMatching})`;
    btnAll.innerText = `All (${totalAllMatching})`;
}

function extractCleanAbstract(htmlStr) {
    if (!htmlStr) return "";
    return htmlStr.replace(/<[^>]*>/g, " ");
}

function initScatterDataIndex() {
    allScatterData.forEach(p => {
        const y = p.year || 0;
        totalByYear[y] = (totalByYear[y] || 0) + 1;
        const title = (p.title_plain || p.title || "").toLowerCase();
        const terms = (p.terms || []).join(" ").toLowerCase();
        const abstract = extractCleanAbstract(p.abstract_html).toLowerCase();
        const authorsList = (p.all_authors || []).map(a => a.toLowerCase());
        const authors = authorsList.join(" ");
        const journal = (p.journal || "").toLowerCase();
        p._searchTitle = `${title} ${terms}`;
        p._searchAll = `${title} ${terms} ${abstract}`;
        p._searchAuthors = authors;
        p._searchAuthorsList = authorsList;
        p._searchJournal = journal;
        p._tokensTitle = Array.from(new Set(tokenizeTextTokens(p._searchTitle)));
        p._tokensAll = Array.from(new Set(tokenizeTextTokens(p._searchAll)));
    });
}

function mapYValue(realVal, isVelocity) {
    if (isVelocity) {
        if (realVal <= 2.0) {
            return (realVal / 2.0) * 0.18;
        } else {
            return 0.18 + (Math.log10(realVal) - Math.log10(2.0)) * 2.0;
        }
    } else {
        if (realVal < 10.0) {
            return (realVal / 10.0) * 0.20;
        } else {
            return 0.20 + (Math.log10(realVal) - 1.0);
        }
    }
}

function getSortComparator(sortKey) {
    if (sortKey === 'citations') {
        return (a, b) => (b.real_citations - a.real_citations) || (b.velocity - a.velocity);
    } else if (sortKey === 'velocity') {
        return (a, b) => (b.velocity - a.velocity) || (b.real_citations - a.real_citations);
    } else if (sortKey === 'date_desc') {
        return (a, b) => {
            const da = a.date || `${a.year}-01-01`;
            const db = b.date || `${b.year}-01-01`;
            return db.localeCompare(da) || (b.real_citations - a.real_citations);
        };
    } else if (sortKey === 'date_asc') {
        return (a, b) => {
            const da = a.date || `${a.year}-01-01`;
            const db = b.date || `${b.year}-01-01`;
            return da.localeCompare(db) || (b.real_citations - a.real_citations);
        };
    }
    return (a, b) => b.real_citations - a.real_citations;
}

function getSortSubtitleText(sortKey) {
    if (sortKey === 'citations') return 'Sorted by citations (descending)';
    if (sortKey === 'velocity') return 'Sorted by velocity (cit./yr)';
    if (sortKey === 'date_desc') return 'Sorted by date (newest first)';
    if (sortKey === 'date_asc') return 'Sorted by date (oldest first)';
    return 'Sorted results';
}

function dismissSearchHint() {
    const hint = document.getElementById('searchHintBubble');
    if (hint) {
        hint.style.opacity = '0';
        setTimeout(() => hint.remove(), 260);
    }
    const searchInput = document.getElementById('scatterTitleSearch');
    if (searchInput) {
        searchInput.classList.remove('hint-active');
    }
}

function applyTopByYearAction(n = 3) {
    const searchInput = document.getElementById('scatterTitleSearch');
    if (!searchInput) return;
    dismissSearchHint();
    searchInput.value = `topbyyear:${n}`;
    onTitleSearchInput(searchInput.value);
}

function resetToTopByYear() {
    const searchInput = document.getElementById('scatterTitleSearch');
    if (searchInput) {
        searchInput.value = "topbyyear:3";
        onTitleSearchInput("topbyyear:3");
    }
}

function clearHeatmapHighlights() {
    selectedHeatmapCell = null;
    selectedHeatmapTopic = null;
    document.querySelectorAll('.heat-tile.heat-active-cell').forEach(el => el.classList.remove('heat-active-cell'));
    document.querySelectorAll('.heat-row.heat-active-row').forEach(el => el.classList.remove('heat-active-row'));
}

function setPlotMetric(mode) {
    currentMetricMode = mode;
    document.getElementById('btnMetricVelocity').classList.toggle('active', mode === 'velocity');
    document.getElementById('btnMetricCitations').classList.toggle('active', mode === 'citations');
    applyCurrentView();
    syncUrlParams();
}

function setReviewFilter(mode) {
    currentReviewFilter = mode;
    document.getElementById('btnReviewPeer').classList.toggle('active', mode === 'peer-reviewed');
    document.getElementById('btnReviewAll').classList.toggle('active', mode === 'all');
    applyCurrentView();
    syncUrlParams();
}

function onSideSortChange(newSortKey) {
    currentSideSort = newSortKey;
    const sortBtnMap = {
        'date_desc': 'btnSortDateDesc',
        'date_asc': 'btnSortDateAsc',
        'velocity': 'btnSortVelocity',
        'citations': 'btnSortCitations'
    };
    Object.keys(sortBtnMap).forEach(k => {
        const btn = document.getElementById(sortBtnMap[k]);
        if (btn) btn.classList.toggle('active', k === newSortKey);
    });
    applyCurrentView();
    syncUrlParams();
}

function setSearchScope(inAbstract) {
    searchInAbstract = inAbstract;
    document.getElementById('btnScopeAbstract').classList.toggle('active', inAbstract);
    document.getElementById('btnScopeTitle').classList.toggle('active', !inAbstract);
    applyCurrentView();
    syncUrlParams();
}

function clearSearchInputForFocus() {
    const searchInput = document.getElementById('scatterTitleSearch');
    if (searchInput) searchInput.value = "";
    currentTitleQuery = "";
    dismissSearchHint();
}

function filterByCell(topic, year, pmidList, clickedElement) {
    if (!pmidList || pmidList.length === 0) return;

    clearSearchInputForFocus();
    clearHeatmapHighlights();

    selectedAuthorPair = null;
    selectedJournal = null;
    selectedPmids = new Set(pmidList);
    selectedHeatmapCell = { topic: topic, year: year };

    if (clickedElement) {
        clickedElement.classList.add('heat-active-cell');
    } else {
        const cell = document.querySelector(`.heat-tile[data-term="${topic}"][data-year="${year}"]`);
        if (cell) cell.classList.add('heat-active-cell');
    }

    document.getElementById('authorBannerName').innerText = `${topic} (${year})`;
    document.getElementById('authorMatchCount').innerText = pmidList.length;
    document.getElementById('authorBanner').style.display = 'flex';

    applyCurrentView();
    scrollToScatter();
}

function filterByTopicGlobal(topic, clickedElement) {
    const pmidList = allScatterData.filter(p => p.terms && p.terms.includes(topic)).map(p => p.pmid);
    if (pmidList.length === 0) return;

    clearSearchInputForFocus();
    clearHeatmapHighlights();

    selectedAuthorPair = null;
    selectedJournal = null;
    selectedPmids = new Set(pmidList);
    selectedHeatmapTopic = topic;

    let rowElem = clickedElement ? clickedElement.closest('.heat-row') : document.querySelector(`.heat-row[data-term="${topic}"]`);
    if (rowElem) {
        rowElem.classList.add('heat-active-row');
    }

    document.getElementById('authorBannerName').innerText = `${topic} (Overall)`;
    document.getElementById('authorMatchCount').innerText = pmidList.length;
    document.getElementById('authorBanner').style.display = 'flex';

    applyCurrentView();
    scrollToScatter();
}

function filterByJournal(journalName) {
    clearHeatmapHighlights();
    selectedAuthorPair = null;
    selectedPmids = null;
    selectedJournal = null;

    if (journalName.toLowerCase().includes('biorxiv') || journalName.toLowerCase().includes('medrxiv')) {
        setReviewFilter('all');
    }

    const searchInput = document.getElementById('scatterTitleSearch');
    if (searchInput) {
        searchInput.value = `journal:"${journalName}"`;
        currentTitleQuery = searchInput.value;
    }
    dismissSearchHint();

    applyCurrentView();
    if (networkInstance) networkInstance.unselectAll();
    scrollToScatter();
    syncUrlParams();
}

function cleanAuthorKey(str) {
    if (!str) return "";
    let s = str.trim().replace(/^(van\s+der|van\s+den|van\s+de|van|von\s+der|von|de\s+la|de|der|den|ter)\s+/i, "");
    const parts = s.split(/\s+/).filter(p => p.length > 0);
    if (parts.length === 0) return "";
    const lastName = parts[0].replace(/[^a-zA-Z]/g, "").toLowerCase();
    const initials = parts.slice(1).join("").replace(/[^a-zA-Z]/g, "").toLowerCase();
    const firstInitial = initials ? initials.charAt(0) : "";
    return firstInitial ? `${lastName}_${firstInitial}` : lastName;
}

function parseAuthorDirectiveTokens(val) {
    const raw = (val || "").trim().toLowerCase();
    const parts = raw.split(/\s+/).filter(p => p.length > 0);
    if (parts.length === 0) {
        return { raw: "", key: "", lastName: "", initials: "" };
    }
    const lastName = parts[0].replace(/[^a-zA-Z]/g, "");
    const initials = parts.slice(1).join("").replace(/[^a-zA-Z]/g, "");
    return {
        raw: raw,
        key: cleanAuthorKey(raw),
        lastName: lastName,
        initials: initials
    };
}

function matchAuthorString(authorName, req) {
    const cleanName = (authorName || "").toLowerCase().replace(/[^a-zA-Z\s]/g, " ").trim();
    const tokens = cleanName.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return false;

    const targetLastName = req.lastName;
    const targetInitials = req.initials;

    const hasLastName = tokens.includes(targetLastName);
    if (!hasLastName) return false;

    if (!targetInitials) return true;

    const lastNameIdx = tokens.indexOf(targetLastName);

    if (lastNameIdx === 0 && tokens.length > 1) {
        const candidateInitials = tokens.slice(1).join("");
        if (candidateInitials.startsWith(targetInitials) || targetInitials.startsWith(candidateInitials)) {
            return true;
        }
    }

    if (lastNameIdx > 0) {
        const candidateFirst = tokens[0];
        if (candidateFirst.startsWith(targetInitials.charAt(0))) {
            if (targetInitials.length > 1 && tokens.length > 2) {
                const candidateMiddle = tokens[1];
                return candidateMiddle.startsWith(targetInitials.charAt(1));
            }
            return true;
        }
    }

    return false;
}

function filterByAuthorName(authorName) {
    clearHeatmapHighlights();
    selectedAuthorPair = null;
    selectedPmids = null;
    selectedJournal = null;
    document.getElementById('authorBanner').style.display = 'none';

    const cleanName = (authorName || '').trim();
    const searchInput = document.getElementById('scatterTitleSearch');
    if (searchInput) {
        searchInput.value = `author:"${cleanName}"`;
        currentTitleQuery = searchInput.value;
    }
    dismissSearchHint();

    applyCurrentView();
    scrollToScatter();
    syncUrlParams();
}

function highlightCollaboration(key1, key2, name1, name2) {
    clearSearchInputForFocus();
    clearHeatmapHighlights();
    selectedAuthorPair = [key1, key2];
    selectedPmids = null;
    selectedJournal = null;

    let count = 0;
    allScatterData.forEach(p => {
        if (p.canonical_keys && selectedAuthorPair.every(k => p.canonical_keys.includes(k))) count++;
    });

    document.getElementById('authorBannerName').innerText = `Collaboration: ${name1} & ${name2}`;
    document.getElementById('authorMatchCount').innerText = count;
    document.getElementById('authorBanner').style.display = 'flex';

    applyCurrentView();
    if (networkInstance) {
        networkInstance.selectNodes([key1, key2]);
    }
    scrollToScatter();
}

function clearAllFilters() {
    selectedAuthorPair = null;
    selectedPmids = null;
    selectedJournal = null;
    clearHeatmapHighlights();
    currentFilterType = null;
    currentReviewFilter = 'peer-reviewed';
    currentTitleQuery = "";
    document.getElementById('btnReviewPeer').classList.add('active');
    document.getElementById('btnReviewAll').classList.remove('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const firstBtn = document.querySelectorAll('.filter-btn')[0];
    if (firstBtn) firstBtn.classList.add('active');
    const searchBox = document.getElementById('scatterTitleSearch');
    if (searchBox) searchBox.value = "";
    document.getElementById('authorBanner').style.display = 'none';

    applyCurrentView();
    if (networkInstance) {
        networkInstance.unselectAll();
    }
    syncUrlParams();
}

function onTitleSearchInput(val) {
    currentTitleQuery = val || "";
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        applyCurrentView();
        syncUrlParams();
    }, 80);
}

function highlightScatterPointForPmid(pmid) {
    highlightedScatterPmid = String(pmid).trim();
    if (scatterChartInstance) {
        scatterChartInstance.render();
    }
}

function clearScatterPointHighlight() {
    highlightedScatterPmid = null;
    if (scatterChartInstance) {
        scatterChartInstance.render();
    }
}

function buildPaperCardHtml(paper, idx, isOverlay = false) {
    const pmid = paper.pmid;
    const pmidUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    
    let licBadge = '';
    if (paper.license && paper.license.is_cc && paper.license.url) {
        licBadge = `<a href="${escapeHtml(paper.license.url)}" target="_blank" rel="noopener noreferrer" class="badge badge-oa" title="Open Access under ${escapeHtml(paper.license.label)}">${escapeHtml(paper.license.label)} ↗</a>`;
    } else if (paper.has_fulltext && paper.pmcid) {
        licBadge = `<span class="badge badge-oa" title="Full-text available on PMC">PMC Full-Text</span>`;
    }

    let preprintBadge = '';
    if (paper.is_preprint) {
        preprintBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600;">PREPRINT</span>`;
    }

    const dateStr = paper.date || paper.year;
    const allAuthors = paper.all_authors || [];
    const firstAuthor = paper.author || (allAuthors.length > 0 ? allAuthors[0] : "Unknown");
    const firstAuthorSurname = firstAuthor !== "Unknown" ? firstAuthor.split(" ")[0] : "Unknown";
    const etAlDisplay = allAuthors.length > 1 ? `${firstAuthorSurname} et al.` : firstAuthor;
    const allAuthorsTooltip = escapeHtml(allAuthors.length > 0 ? allAuthors.join(", ") : firstAuthor);

    const seniorAuthor = paper.senior_author || "Unknown";
    const journalDisplay = paper.journal || "PubMed";

    const firstAuthorEsc = escapeHtml(firstAuthor).replace(/'/g, "\\'");
    const seniorAuthorEsc = escapeHtml(seniorAuthor).replace(/'/g, "\\'");

    let seniorBadgeHtml = '';
    if (seniorAuthor && seniorAuthor !== 'Unknown' && seniorAuthor !== firstAuthor) {
        seniorBadgeHtml = `<span class="author-tag senior-author" title="Filter by senior author: ${escapeHtml(seniorAuthor)}" onclick="filterByAuthorName('${seniorAuthorEsc}')"><span class="author-tag-icon">🔍</span>Senior: <strong>${escapeHtml(seniorAuthor)}</strong></span>`;
    } else if (seniorAuthor === firstAuthor && firstAuthor !== 'Unknown') {
        seniorBadgeHtml = `<span class="author-tag senior-author" title="Filter by author: ${escapeHtml(firstAuthor)}" onclick="filterByAuthorName('${firstAuthorEsc}')"><span class="author-tag-icon">🔍</span>Sole / First & Senior</span>`;
    }

    let firstAuthorBadge = '';
    if (firstAuthor !== 'Unknown') {
        firstAuthorBadge = `<span class="author-tag first-author" title="${allAuthorsTooltip}" onclick="filterByAuthorName('${firstAuthorEsc}')"><span class="author-tag-icon">🔍</span><strong>${escapeHtml(etAlDisplay)}</strong></span>`;
    } else {
        firstAuthorBadge = `<span class="author-tag first-author" title="First Author">First: <strong>Unknown</strong></span>`;
    }

    const activeTerms = getActiveSearchTerms();
    const displayTitle = highlightTextHtml(paper.title, activeTerms);
    const displayAbstract = highlightTextHtml(paper.abstract_html || '<em>No abstract available.</em>', activeTerms);

    const rankHtml = idx !== undefined && idx !== null ? `<span class="paper-rank">#${idx + 1}</span>` : '';
    const abstractClass = isOverlay ? "paper-abstract-block is-expanded" : "paper-abstract-block";
    const readMoreButtonHtml = isOverlay ? "" : `<button class="paper-btn-more" onclick="expandPaperAbstract(this)">... Read more</button>`;
    const hoverEvents = isOverlay ? "" : `onmouseenter="highlightScatterPointForPmid('${pmid}')" onmouseleave="clearScatterPointHighlight()"`;

    return `
    <div class="side-paper-item" data-pmid="${pmid}" ${hoverEvents}>
        <div class="side-paper-meta-top">
            ${rankHtml}
            <span class="badge badge-date">📅 ${dateStr}</span>
            <span class="badge badge-citations">★ ${paper.real_citations.toLocaleString()} cit.</span>
            <span class="badge badge-velocity">⚡ ${paper.velocity} cit./yr</span>
            <span class="badge badge-type">${paper.study_type}</span>
            ${firstAuthorBadge}
            ${seniorBadgeHtml}
            ${preprintBadge}
            ${licBadge}
            <a href="${pmidUrl}" target="_blank" rel="noopener noreferrer" class="pmid-link pmid-badge-link" style="margin-left: auto;">PMID: ${pmid} ↗</a>
        </div>

        <div class="side-paper-row-second">
            <h3 class="side-paper-title">
                <a href="${pmidUrl}" target="_blank" rel="noopener noreferrer">${displayTitle}</a>
            </h3>
            <span class="side-journal-right" title="${escapeHtml(journalDisplay)}">${escapeHtml(journalDisplay)}</span>
        </div>

        <div class="${abstractClass}">
            ${displayAbstract}
        </div>
        ${readMoreButtonHtml}
    </div>`;
}

function loadMoreSidePapers() {
    if (currentlyDisplayedCount >= currentFilteredPapers.length) return;
    const list = document.getElementById('sidePaneList');
    if (!list) return;

    const nextBatch = currentFilteredPapers.slice(currentlyDisplayedCount, currentlyDisplayedCount + 30);
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    const newCardsHtml = nextBatch.map((paper, idx) => buildPaperCardHtml(paper, currentlyDisplayedCount + idx, false)).join('');
    tempDiv.innerHTML = newCardsHtml;

    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }

    const loadMoreEl = document.getElementById('loadMoreContainer');
    if (loadMoreEl) {
        list.insertBefore(fragment, loadMoreEl);
    } else {
        list.appendChild(fragment);
    }

    currentlyDisplayedCount += nextBatch.length;
    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    const existingBtn = document.getElementById('loadMoreContainer');
    if (existingBtn) existingBtn.remove();

    if (currentlyDisplayedCount < currentFilteredPapers.length) {
        const list = document.getElementById('sidePaneList');
        const remaining = currentFilteredPapers.length - currentlyDisplayedCount;
        const container = document.createElement('div');
        container.id = 'loadMoreContainer';
        container.className = 'load-more-container';
        container.innerHTML = `<button class="load-more-btn" onclick="loadMoreSidePapers()">+ Load ${Math.min(30, remaining)} more (${remaining} remaining)</button>`;
        list.appendChild(container);
    }
}

function renderSidePane(papers, isFiltered, isTopByYear, topN, hasSyntaxError) {
    const pane = document.getElementById('selectedPapersPane');
    const list = document.getElementById('sidePaneList');
    const titleEl = document.getElementById('sidePaneTitle');
    const subtitleEl = document.getElementById('sidePaneSubtitle');

    if (!pane || !list) return;

    if (hasSyntaxError) {
        titleEl.innerText = "Syntax Error";
        subtitleEl.innerText = "Invalid filter syntax";
        list.innerHTML = `
        <div class="side-syntax-error">
            <div class="syntax-error-title">⚠️ Invalid Filter Syntax</div>
            <div><code>topbyyear:N</code> (or <code>!topByYear(N)</code>) must be used alone and cannot be combined with search terms.</div>
            <div><strong>Valid example:</strong> <code>topbyyear:3</code>, <code>author:Kramm</code>, or <code>journal:"Neuro-Oncol"</code></div>
            <button class="filter-btn" style="margin-top: 0.4rem; align-self: flex-start;" onclick="resetToTopByYear()">Fix: Use topbyyear:3</button>
        </div>`;
        return;
    }

    if (isTopByYear) {
        titleEl.innerText = `${papers.length.toLocaleString()} Results`;
        subtitleEl.innerText = `Top ${topN} papers per year (years <= ${currentYearLimit})`;

        const byYear = {};
        papers.forEach(p => {
            const y = p.year || 0;
            if (!byYear[y]) byYear[y] = [];
            byYear[y].push(p);
        });

        const yearsDesc = Object.keys(byYear).map(Number).sort((a, b) => b - a);
        const sortComparator = getSortComparator(currentSideSort);

        let groupHtml = '';
        yearsDesc.forEach(year => {
            const yearPapers = byYear[year];
            yearPapers.sort(sortComparator);
            const totalInYear = totalByYear[year] || yearPapers.length;
            groupHtml += `
            <div class="side-year-group">
                <div class="side-year-header">
                    <span class="side-year-title">${year}</span>
                    <span class="side-year-badge">Top ${yearPapers.length} of ${totalInYear} papers</span>
                </div>
                <div class="side-year-papers">
                    ${yearPapers.map((paper, idx) => buildPaperCardHtml(paper, idx, false)).join('')}
                </div>
            </div>`;
        });

        list.innerHTML = groupHtml;
        const loadMoreBtn = document.getElementById('loadMoreContainer');
        if (loadMoreBtn) loadMoreBtn.remove();
        list.scrollTop = 0;
    } else {
        titleEl.innerText = `${papers.length.toLocaleString()} Results`;
        subtitleEl.innerText = getSortSubtitleText(currentSideSort);

        currentFilteredPapers = papers.slice().sort(getSortComparator(currentSideSort));
        currentlyDisplayedCount = Math.min(40, currentFilteredPapers.length);

        const initialSlice = currentFilteredPapers.slice(0, currentlyDisplayedCount);
        list.innerHTML = initialSlice.map((paper, idx) => buildPaperCardHtml(paper, idx, false)).join('');
        
        updateLoadMoreButton();
        list.scrollTop = 0;
    }
}

function clearNodeHoverHighlight() {
    if (currentHoveredPaperPmid) {
        const prevCard = document.querySelector(`.side-paper-item[data-pmid="${currentHoveredPaperPmid}"]`);
        if (prevCard) prevCard.classList.remove('side-paper-item-hovered');
        currentHoveredPaperPmid = null;
    }
    const overlay = document.getElementById('hoveredPaperOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }
}

function handleNodeHover(activeElements) {
    if (!activeElements || activeElements.length === 0) {
        clearNodeHoverHighlight();
        return;
    }

    const firstElem = activeElements[0];
    const datasetIndex = firstElem.datasetIndex !== undefined ? firstElem.datasetIndex : 0;
    const index = firstElem.index;
    const point = scatterChartInstance.data.datasets[datasetIndex].data[index];
    if (!point || !point.pmid) {
        clearNodeHoverHighlight();
        return;
    }

    if (currentHoveredPaperPmid === point.pmid) return;
    clearNodeHoverHighlight();
    currentHoveredPaperPmid = point.pmid;

    const isDimmed = Boolean(point._isDimmed);
    const isFilterEmpty = !(currentTitleQuery || '').trim();
    const targetCard = !isFilterEmpty ? document.querySelector(`.side-paper-item[data-pmid="${point.pmid}"]`) : null;

    if (!isDimmed && targetCard) {
        targetCard.classList.add('side-paper-item-hovered');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        const overlay = document.getElementById('hoveredPaperOverlay');
        if (overlay) {
            overlay.innerHTML = buildPaperCardHtml(point, null, true);
            const cardInner = overlay.querySelector('.side-paper-item');
            if (cardInner) {
                cardInner.style.background = 'transparent';
                cardInner.style.border = 'none';
                cardInner.style.padding = '0';
            }
            overlay.style.display = 'flex';
        }
    }
}

function handleScatterNodeClick(event, activeElements) {
    if (!activeElements || activeElements.length === 0) return;
    const idx = activeElements[0].index;
    const p = scatterChartInstance.data.datasets[0].data[idx];
    if (!p || !p.pmid) return;

    clearNodeHoverHighlight();

    const clickedPmid = String(p.pmid).trim();
    const searchInput = document.getElementById('scatterTitleSearch');
    if (!searchInput) return;

    dismissSearchHint();
    clearHeatmapHighlights();
    selectedAuthorPair = null;
    selectedPmids = null;
    selectedJournal = null;
    document.getElementById('authorBanner').style.display = 'none';

    const isShift = event.native && event.native.shiftKey;
    const currentVal = (searchInput.value || '').trim();
    const pmidPrefixMatch = currentVal.match(/^pmid:([0-9,\s]+)$/i);

    if (isShift && pmidPrefixMatch) {
        const existingPmids = pmidPrefixMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (!existingPmids.includes(clickedPmid)) {
            existingPmids.push(clickedPmid);
        }
        searchInput.value = `pmid:${existingPmids.join(',')}`;
    } else {
        searchInput.value = `pmid:${clickedPmid}`;
    }

    currentTitleQuery = searchInput.value;
    applyCurrentView();
    scrollToScatter();
    syncUrlParams();

    const targetCard = document.querySelector(`.side-paper-item[data-pmid="${clickedPmid}"]`);
    if (targetCard) {
        const abstractBlock = targetCard.querySelector('.paper-abstract-block');
        if (abstractBlock) abstractBlock.classList.add('is-expanded');
        const moreBtn = targetCard.querySelector('.paper-btn-more');
        if (moreBtn) moreBtn.remove();

        targetCard.classList.add('side-paper-item-hovered');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        currentHoveredPaperPmid = clickedPmid;
    }
}

function normalizeJournalStr(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .replace(/[:.,]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function applyCurrentView() {
    let filtered = allScatterData;
    let hasActiveFilter = false;
    let hasSyntaxError = false;
    let isTopByYear = false;
    let topN = null;

    if (currentReviewFilter === 'peer-reviewed') {
        filtered = filtered.filter(p => !p.is_preprint);
        hasActiveFilter = true;
    }

    const trimmedQuery = currentTitleQuery.trim();
    const containsTopByYear = /(?:!topByYear|topbyyear)/i.test(trimmedQuery);
    const exactTopMatch = trimmedQuery.match(/^(?:topbyyear:\s*(\d+)|!topbyyear\(\s*(\d+)\s*\))$/i);

    const pmidDirectives = [];
    const pmidRegex = /(?:^|\s)pmid:(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;
    let pmidMatch;
    while ((pmidMatch = pmidRegex.exec(trimmedQuery)) !== null) {
        const val = (pmidMatch[1] || pmidMatch[2] || pmidMatch[3] || "").trim();
        if (val) {
            const splitPmids = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
            pmidDirectives.push(...splitPmids);
        }
    }

    const authorDirectives = [];
    const authorRegex = /(?:^|\s)author:(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;
    let authMatch;
    while ((authMatch = authorRegex.exec(trimmedQuery)) !== null) {
        const val = (authMatch[1] || authMatch[2] || authMatch[3] || "").trim();
        if (val) {
            authorDirectives.push(parseAuthorDirectiveTokens(val));
        }
    }

    const journalDirectives = [];
    const journalRegex = /(?:^|\s)journal:(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;
    let jourMatch;
    while ((jourMatch = journalRegex.exec(trimmedQuery)) !== null) {
        const isQuoted = Boolean(jourMatch[1] || jourMatch[2]);
        const val = (jourMatch[1] || jourMatch[2] || jourMatch[3] || "").trim();
        if (val) {
            journalDirectives.push({ raw: val.toLowerCase(), norm: normalizeJournalStr(val), exact: isQuoted });
        }
    }

    let queryWithoutDirectives = trimmedQuery
        .replace(/(?:^|\s)pmid:(?:"[^"]+"|'[^']+'|[^\s]+)/gi, " ")
        .replace(/(?:^|\s)author:(?:"[^"]+"|'[^']+'|[^\s]+)/gi, " ")
        .replace(/(?:^|\s)journal:(?:"[^"]+"|'[^']+'|[^\s]+)/gi, " ")
        .trim();

    if (containsTopByYear) {
        if (exactTopMatch) {
            isTopByYear = true;
            topN = parseInt(exactTopMatch[1] || exactTopMatch[2], 10);
            hasActiveFilter = true;
        } else {
            hasSyntaxError = true;
            hasActiveFilter = true;
        }
    } else if (trimmedQuery.length > 0) {
        hasActiveFilter = true;
    }

    if (selectedAuthorPair || selectedPmids || selectedJournal) {
        hasActiveFilter = true;
    }

    if (hasSyntaxError) {
        filtered = [];
    } else if (isTopByYear && topN && topN > 0) {
        if (selectedPmids !== null) {
            filtered = filtered.filter(p => selectedPmids.has(p.pmid));
        } else if (selectedAuthorPair) {
            filtered = filtered.filter(p => p.canonical_keys && selectedAuthorPair.every(k => p.canonical_keys.includes(k)));
        } else if (selectedJournal) {
            filtered = filtered.filter(p => p.journal === selectedJournal);
        }

        if (currentFilterType) {
            filtered = filtered.filter(p => p.study_type === currentFilterType);
        }

        const byYear = {};
        filtered.forEach(p => {
            const y = p.year || 0;
            if (y <= currentYearLimit) {
                if (!byYear[y]) byYear[y] = [];
                byYear[y].push(p);
            }
        });

        const topPicked = [];
        const isVelocity = currentMetricMode === 'velocity';
        const sortKey = isVelocity ? (p => p.velocity) : (p => p.real_citations);

        Object.keys(byYear).forEach(y => {
            const yearPapers = byYear[y];
            yearPapers.sort((a, b) => sortKey(b) - sortKey(a));
            topPicked.push(...yearPapers.slice(0, topN));
        });

        filtered = topPicked;
    } else {
        if (selectedPmids !== null) {
            filtered = filtered.filter(p => selectedPmids.has(p.pmid));
        } else if (selectedAuthorPair) {
            filtered = filtered.filter(p => p.canonical_keys && selectedAuthorPair.every(k => p.canonical_keys.includes(k)));
        } else if (selectedJournal) {
            filtered = filtered.filter(p => p.journal === selectedJournal);
        }

        if (currentFilterType) {
            filtered = filtered.filter(p => p.study_type === currentFilterType);
            hasActiveFilter = true;
        }

        if (pmidDirectives.length > 0) {
            hasActiveFilter = true;
            const pmidSet = new Set(pmidDirectives);
            filtered = filtered.filter(p => pmidSet.has(p.pmid));
        }

        if (authorDirectives.length > 0) {
            hasActiveFilter = true;
            filtered = filtered.filter(p => {
                const keys = p.canonical_keys || [];
                const authorsList = p._searchAuthorsList || [];
                return authorDirectives.every(reqAuth => {
                    if (reqAuth.key && keys.includes(reqAuth.key)) {
                        return true;
                    }
                    return authorsList.some(authorName => matchAuthorString(authorName, reqAuth));
                });
            });
        }

        if (journalDirectives.length > 0) {
            hasActiveFilter = true;
            filtered = filtered.filter(p => {
                const journalRaw = p._searchJournal || "";
                const journalNorm = normalizeJournalStr(journalRaw);
                return journalDirectives.every(reqJour => {
                    if (reqJour.exact) {
                        return journalRaw === reqJour.raw || journalNorm === reqJour.norm;
                    }
                    return journalRaw.includes(reqJour.raw) || journalNorm.includes(reqJour.norm);
                });
            });
        }

        if (queryWithoutDirectives.length > 0) {
            const parsedTokens = tokenizeQueryTerms(queryWithoutDirectives);
            const totalChars = parsedTokens.filter(t => !t.isNeg).reduce((sum, t) => sum + t.text.length, 0);

            if (totalChars >= 3) {
                const posTerms = parsedTokens.filter(t => !t.isNeg).map(t => t.text);
                const negTerms = parsedTokens.filter(t => t.isNeg && t.text.length > 1).map(t => t.text);
                const allWordsCount = posTerms.reduce((sum, t) => sum + (tokenizeTextTokens(t).length || 1), 0);
                const isMultiTerm = allWordsCount > 1;

                if (posTerms.length > 0 || negTerms.length > 0) {
                    hasActiveFilter = true;
                    filtered = filtered.filter(p => {
                        const docTokens = searchInAbstract ? (p._tokensAll || []) : (p._tokensTitle || []);
                        const rawCorpus = searchInAbstract ? p._searchAll : p._searchTitle;
                        return posTerms.every(t => matchesSingleTerm(docTokens, rawCorpus, t, isMultiTerm)) &&
                               !negTerms.some(t => matchesSingleTerm(docTokens, rawCorpus, t, isMultiTerm));
                    });
                }
            }
        }
    }

    const badge = document.getElementById('scatterCountBadge');
    if (badge) {
        if (hasSyntaxError) {
            badge.innerText = `0 / ${allScatterData.length.toLocaleString()} papers (Syntax Error)`;
        } else {
            badge.innerText = `${filtered.length.toLocaleString()} / ${allScatterData.length.toLocaleString()} papers`;
        }
    }

    renderSidePane(filtered, hasActiveFilter, isTopByYear, topN, hasSyntaxError);

    const matchedPmidSet = new Set(filtered.map(p => p.pmid));
    const isVelocity = currentMetricMode === 'velocity';

    const preparedPoints = allScatterData.map(p => {
        const rawVal = isVelocity ? p.velocity : p.real_citations;
        const isDimmed = hasActiveFilter ? !matchedPmidSet.has(p.pmid) : false;
        const rawMs = new Date(p.x).getTime();
        return {
            ...p,
            x: mapTimestampToCompressedX(rawMs),
            real_timestamp: rawMs,
            y: mapYValue(rawVal, isVelocity),
            _isDimmed: isDimmed
        };
    });

    preparedPoints.sort((a, b) => {
        if (a._isDimmed === b._isDimmed) return 0;
        return a._isDimmed ? -1 : 1;
    });

    initOrUpdateScatterChart(preparedPoints);
}

function getPlasmaColor(t) {
    const stops = [
        { t: 0.00, c: [13, 8, 135] },
        { t: 0.22, c: [126, 3, 168] },
        { t: 0.48, c: [204, 71, 120] },
        { t: 0.72, c: [248, 149, 64] },
        { t: 1.00, c: [240, 249, 33] }
    ];
    const clampedT = Math.min(1.0, Math.max(0.0, t));
    let i = 0;
    while (i < stops.length - 1 && stops[i + 1].t < clampedT) i++;
    const s0 = stops[i];
    const s1 = stops[i + 1] || stops[i];
    const span = s1.t - s0.t;
    const factor = span === 0 ? 0 : (clampedT - s0.t) / span;

    const r = Math.round(s0.c[0] + (s1.c[0] - s0.c[0]) * factor);
    const g = Math.round(s0.c[1] + (s1.c[1] - s0.c[1]) * factor);
    const b = Math.round(s0.c[2] + (s1.c[2] - s0.c[2]) * factor);
    return [r, g, b];
}

function calculatePointStyle(pointData) {
    const isVelocity = currentMetricMode === 'velocity';
    const val = isVelocity ? pointData.velocity : pointData.real_citations;
    const logVal = Math.log10(val + (isVelocity ? 0.1 : 1.0));
    
    const denom = isVelocity ? 2.2 : 3.0;
    const offset = isVelocity ? 0.0 : 0.2;
    const t = Math.min(1.0, Math.max(0.0, (logVal - offset) / denom));
    const rgb = getPlasmaColor(t);

    const radius = 2.4 + t * 5.6;

    if (pointData._isDimmed) {
        return {
            color: 'rgba(51, 65, 85, 0.35)',
            radius: radius,
            borderColor: 'transparent',
            borderWidth: 0
        };
    }

    const alpha = 0.40 + t * 0.55;
    return {
        color: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(2)})`,
        radius: radius,
        borderColor: t > 0.4 ? 'rgba(255, 255, 255, 0.4)' : 'transparent',
        borderWidth: 1
    };
}

const scatterHighlightPlugin = {
    id: 'scatterHighlightPlugin',
    afterDraw(chart) {
        if (!highlightedScatterPmid) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;

        const targetPmid = String(highlightedScatterPmid).trim();
        const pointIdx = meta._dataset.data.findIndex(p => String(p.pmid).trim() === targetPmid);
        if (pointIdx === -1) return;

        const element = meta.data[pointIdx];
        if (!element) return;

        const { x, y } = element.getProps(['x', 'y'], true);
        const baseRadius = element.options ? element.options.radius || 4 : 4;
        const ringRadius = baseRadius + 4;
        const ctx = chart.ctx;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
    }
};

function initOrUpdateScatterChart(dataPoints) {
    const isVelocity = currentMetricMode === 'velocity';
    const styles = dataPoints.map(p => calculatePointStyle(p));
    const canvas = document.getElementById('scatterChart');
    const ctx = canvas.getContext('2d');

    const yAxisTitle = isVelocity ? 'Citation Velocity (Citations / Year | Compressed 0–2 cit./yr, Log above 2)' : 'Total Citations (Logarithmic above 10)';
    const maxYAxis = isVelocity ? 4.2 : 3.8;

    const minXDataLimit = mapTimestampToCompressedX(new Date('1970-01-01T00:00:00Z').getTime());
    const maxXDataLimit = mapTimestampToCompressedX(new Date(`${currentYearLimit + 1}-01-01T00:00:00Z`).getTime());
    const maxYDataLimit = maxYAxis * 1.05;

    if (scatterChartInstance) {
        scatterChartInstance.data.datasets[0].data = dataPoints;
        scatterChartInstance.data.datasets[0].backgroundColor = styles.map(s => s.color);
        scatterChartInstance.data.datasets[0].borderColor = styles.map(s => s.borderColor);
        scatterChartInstance.data.datasets[0].borderWidth = styles.map(s => s.borderWidth);
        scatterChartInstance.data.datasets[0].pointRadius = styles.map(s => s.radius);
        scatterChartInstance.options.scales.y.title.text = yAxisTitle;
        scatterChartInstance.options.scales.y.suggestedMax = maxYAxis;
        if (scatterChartInstance.options.plugins.zoom && scatterChartInstance.options.plugins.zoom.limits) {
            scatterChartInstance.options.plugins.zoom.limits.x = { min: minXDataLimit, max: maxXDataLimit };
            scatterChartInstance.options.plugins.zoom.limits.y = { min: 0, max: maxYDataLimit };
        }
        scatterChartInstance.update('none');
        return;
    }

    scatterChartInstance = new Chart(ctx, {
        type: 'scatter',
        plugins: [scatterHighlightPlugin],
        data: {
            datasets: [{
                data: dataPoints,
                backgroundColor: styles.map(s => s.color),
                borderColor: styles.map(s => s.borderColor),
                borderWidth: styles.map(s => s.borderWidth),
                pointRadius: styles.map(s => s.radius),
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onHover: (event, activeElements) => {
                if (activeElements.length > 0) {
                    event.native.target.style.cursor = 'pointer';
                } else if (scatterChartInstance && scatterChartInstance.isZoomedOrPanned && scatterChartInstance.isZoomedOrPanned()) {
                    event.native.target.style.cursor = 'grab';
                } else {
                    event.native.target.style.cursor = 'default';
                }
                handleNodeHover(activeElements);
            },
            onClick: (event, activeElements) => {
                handleScatterNodeClick(event, activeElements);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false
                },
                zoom: {
                    limits: {
                        x: { min: minXDataLimit, max: maxXDataLimit },
                        y: { min: 0, max: maxYDataLimit }
                    },
                    pan: { 
                        enabled: true, 
                        mode: 'xy', 
                        threshold: 0,
                        onPanStart: () => { canvas.style.cursor = 'grabbing'; },
                        onPanComplete: () => { 
                            canvas.style.cursor = 'grab'; 
                            scatterChartInstance.render(); 
                        }
                    },
                    zoom: { 
                        wheel: { enabled: true }, 
                        pinch: { enabled: true }, 
                        mode: 'xy', 
                        onZoomComplete: () => scatterChartInstance.render() 
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Publication Date (Compressed <= 2005)', color: '#9ca3af', font: { size: 13, weight: '600' } },
                    grid: { color: '#1f2937' },
                    afterBuildTicks: function(axis) {
                        const dynamicTicks = buildDynamicScatterXTicks(axis.min, axis.max, currentYearLimit);
                        axis.ticks = dynamicTicks.map(t => ({ value: t.val, label: t.label }));
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 12 },
                        autoSkip: false,
                        callback: function(val, index, ticks) {
                            const tickObj = ticks[index];
                            return tickObj && tickObj.label ? tickObj.label : null;
                        }
                    }
                },
                y: {
                    type: 'linear',
                    suggestedMin: 0,
                    suggestedMax: maxYAxis,
                    title: { display: true, text: yAxisTitle, color: '#9ca3af', font: { size: 13, weight: '600' } },
                    grid: { color: '#1f2937' },
                    afterBuildTicks: function(axis) {
                        const isVel = currentMetricMode === 'velocity';
                        const dynamicTicks = buildDynamicYTicks(axis.min, axis.max, isVel);
                        axis.ticks = dynamicTicks.map(t => ({ value: t.v, label: t.label }));
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 12 },
                        autoSkip: false,
                        callback: function(val, index, ticks) {
                            const tickObj = ticks[index];
                            return tickObj && tickObj.label ? tickObj.label : null;
                        }
                    }
                }
            }
        }
    });

    canvas.addEventListener('mouseleave', () => {
        clearNodeHoverHighlight();
    });
}

function setFilter(studyType, btnElement) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    currentFilterType = studyType;
    applyCurrentView();
    syncUrlParams();
}

function resetScatterZoom() {
    if (scatterChartInstance) {
        scatterChartInstance.resetZoom();
        scatterChartInstance.render();
        const canvas = document.getElementById('scatterChart');
        if (canvas) canvas.style.cursor = 'default';
    }
}
