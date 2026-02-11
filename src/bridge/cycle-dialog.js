/**
 * Show dialog for continuing existing cycle or starting new one
 * @param {Object} ctx - Context with translations
 * @param {Object} existingCycle - Existing cycle data from DB
 * @returns {Promise<'new'|'continue'>} - User's choice
 */
export function showCycleContinueDialog(ctx, existingCycle) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    `;

    const t = (key) => ctx.t(key) || key;
    
    const modal = document.createElement('div');
    modal.className = 'cycle-choice-modal';
    modal.style.cssText = `
      background: #0f5d46;
      padding: 30px;
      border-radius: 12px;
      max-width: 500px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 2px solid #3b8a6a;
      color: #f1f7f3;
    `;

    modal.innerHTML = `
      <h2 style="margin: 0 0 20px 0; color: var(--velvet-bright); text-align: center;">
        ${t('existing_cycle_found') || 'Existing Game Cycle Found'}
      </h2>
      <p style="margin-bottom: 20px; line-height: 1.6;">
        ${t('cycle_continue_message') || 'The same 4 players have played together before. Would you like to continue the previous game cycle or start a new one?'}
      </p>
      <div style="background: rgba(29, 96, 73, 0.6); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0;"><strong>${t('cycle_info') || 'Previous Cycle'}:</strong></p>
        <p style="margin: 0 0 4px 0;">• ${t('cycle_number') || 'Cycle'}: ${existingCycle.cycle_number}</p>
        <p style="margin: 0 0 4px 0;">• ${t('current_game') || 'Game'}: ${existingCycle.current_game}/16</p>
        <p style="margin: 0;">• ${t('last_played') || 'Last played'}: ${new Date(existingCycle.updated_at).toLocaleDateString()}</p>
      </div>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button class="btn-new-cycle" style="
          padding: 12px 24px;
          border: 2px solid #3b8a6a;
          background: rgba(29, 96, 73, 0.8);
          color: #f1f7f3;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 600;
          transition: all 0.3s ease;
        ">
          ${t('start_new_cycle') || 'Start New Cycle'}
        </button>
        <button class="btn-continue-cycle" style="
          padding: 12px 24px;
          border: 2px solid var(--velvet-bright);
          background: rgba(45, 138, 102, 0.9);
          color: #f1f7f3;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 600;
          transition: all 0.3s ease;
        ">
          ${t('continue_cycle') || 'Continue Previous Cycle'}
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const btnNew = modal.querySelector('.btn-new-cycle');
    const btnContinue = modal.querySelector('.btn-continue-cycle');

    btnNew.addEventListener('mouseenter', (e) => {
      e.target.style.background = 'rgba(45, 138, 102, 0.6)';
    });
    btnNew.addEventListener('mouseleave', (e) => {
      e.target.style.background = 'rgba(29, 96, 73, 0.8)';
    });

    btnContinue.addEventListener('mouseenter', (e) => {
      e.target.style.background = 'rgba(45, 138, 102, 1)';
      e.target.style.boxShadow = '0 4px 12px rgba(45, 138, 102, 0.4)';
    });
    btnContinue.addEventListener('mouseleave', (e) => {
      e.target.style.background = 'rgba(45, 138, 102, 0.9)';
      e.target.style.boxShadow = 'none';
    });

    btnNew.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve('new');
    });

    btnContinue.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve('continue');
    });
  });
}
