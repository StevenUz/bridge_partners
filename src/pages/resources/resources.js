import resourcesTemplate from './resources.html?raw'
import './resources.css'
import { Modal } from 'bootstrap'
import { PDF_DOCUMENTS, getPdfUrl } from '../../api/pdf-documents.js'
import { applyTranslations, t } from '../../i18n/i18n.js'

const TUTORIALS = [
  {
    title: 'How To Play Bridge (Complete Tutorial) – Beginners Guide',
    description: 'Comprehensive introduction to the game, including rules, bidding, and strategy',
    url: 'https://www.youtube.com/results?search_query=how+to+play+bridge+complete+tutorial+beginners',
    icon: 'play-circle',
    duration: '15-30 min'
  },
  {
    title: 'Learn Bridge Bidding In 5 Minutes',
    description: 'Short lesson on bidding in bridge',
    url: 'https://www.youtube.com/results?search_query=learn+bridge+bidding+in+5+minutes',
    icon: 'play-circle',
    duration: '5 min'
  },
  {
    title: 'Bridge for First Time BEGINNERS (Super Easy Lesson)',
    description: 'Easy lesson for beginners with explanation of basic concepts',
    url: 'https://www.youtube.com/results?search_query=bridge+first+time+beginners+super+easy',
    icon: 'play-circle',
    duration: '10 min'
  },
  {
    title: 'Bridge Lessons – Learn to Play: Lesson 1 (Introduction)',
    description: 'First lesson for beginners, suitable for completely new players',
    url: 'https://www.youtube.com/results?search_query=bridge+lessons+learn+to+play+lesson+1+introduction',
    icon: 'play-circle',
    duration: '20 min'
  },
  {
    title: 'How to Play Bridge: 5 Minute Quick Start Guide',
    description: 'Super quick introduction to the basic rules',
    url: 'https://www.youtube.com/results?search_query=how+to+play+bridge+5+minute+quick+start',
    icon: 'play-circle',
    duration: '5 min'
  },
  {
    title: 'Learn to Play Bridge: Lesson 1 – Bridge Basics',
    description: 'Lesson with basic rules and concepts of the game',
    url: 'https://www.youtube.com/results?search_query=learn+to+play+bridge+lesson+1+basics',
    icon: 'play-circle',
    duration: '15 min'
  },
  {
    title: 'Introduction to Bridge – Lesson 1 with Jack Stocken',
    description: 'From experienced instructor for beginners',
    url: 'https://www.youtube.com/results?search_query=introduction+bridge+lesson+jack+stocken',
    icon: 'play-circle',
    duration: '25 min'
  },
  {
    title: 'How to Play Bridge: Lesson 1 – with Marla Lawson',
    description: 'Another lesson with the basics, including tactics for taking tricks',
    url: 'https://www.youtube.com/results?search_query=how+to+play+bridge+lesson+marla+lawson',
    icon: 'play-circle',
    duration: '20 min'
  },
  {
    title: 'Learn To Play Bridge – Part 2: Understanding Bidding',
    description: 'More in-depth explanation of bidding in bridge',
    url: 'https://www.youtube.com/results?search_query=learn+bridge+part+2+understanding+bidding',
    icon: 'play-circle',
    duration: '25 min'
  },
  {
    title: 'BEGINNING BRIDGE SERIES 1 (Episode 1)',
    description: 'Starter lesson on tricks and basic concepts, suitable if you\'ve never played cards before',
    url: 'https://www.youtube.com/results?search_query=beginning+bridge+series+1+episode+1',
    icon: 'play-circle',
    duration: '20 min'
  }
]

const HELPFUL_LINKS = [
  {
    title: 'Britannica - How to Play Contract Bridge',
    description: 'Comprehensive guide to contract bridge rules and gameplay',
    url: 'https://www.britannica.com/topic/bridge-card-game/How-to-play-contract-bridge',
    icon: 'book'
  },
  {
    title: 'Bicycle Cards - How to Play Bridge',
    description: 'Official Bicycle Cards guide to bridge',
    url: 'https://bicyclecards.com/how-to-play/bridge',
    icon: 'flower2'
  },
  {
    title: 'No Fear Bridge - How to Play',
    description: 'Beginner-friendly bridge tutorial',
    url: 'https://www.nofearbridge.co.uk/howtoplaybridge.php',
    icon: 'lightbulb'
  },
  {
    title: 'Fun Bridge - How to Play Bridge',
    description: 'Interactive guide to learning bridge',
    url: 'https://funbridge.com/how-to-play-bridge',
    icon: 'play-circle'
  }
]

export const resourcesPage = {
  path: '/resources',
  name: 'resources',
  async render(container, ctx) {
    const host = document.createElement('section')
    host.innerHTML = resourcesTemplate

    applyTranslations(host, ctx.language)
    container.append(host)

    // Initialize Bootstrap tabs (need small delay for DOM to be ready)
    setTimeout(() => {
      initializeBootstrapTabs(host)
      setupResourcesEvents(host, ctx)
    }, 0)
  }
}

function initializeBootstrapTabs(host) {
  // Get all tab buttons
  const tabButtons = host.querySelectorAll('[data-bs-toggle="tab"]')
  const tabContents = host.querySelectorAll('.tab-pane')
  
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', (e) => {
      e.preventDefault()
      
      // Remove active from all buttons
      tabButtons.forEach(btn => btn.classList.remove('active', 'show'))
      
      // Remove active from all content panes
      tabContents.forEach(pane => {
        pane.classList.remove('active', 'show')
      })
      
      // Add active to clicked button
      button.classList.add('active', 'show')
      
      // Add active to corresponding content pane
      const targetId = button.getAttribute('data-bs-target')
      if (targetId) {
        const targetPane = host.querySelector(targetId)
        if (targetPane) {
          targetPane.classList.add('active', 'show')
        }
      }
    })
  })
}

function setupResourcesEvents(host, ctx) {
  // Handle PDF flip card clicks → download
  const flipCards = host.querySelectorAll('.pdf-flip-card')
  flipCards.forEach(card => {
    card.addEventListener('click', () => {
      const pdfKey = card.getAttribute('data-pdf-key')
      const url = getPdfUrl(pdfKey)
      if (url) {
        window.open(url, '_blank')
      }
    })
  })

  // Render helpful links
  const helpfulLinksContainer = host.querySelector('#helpful-links')
  if (helpfulLinksContainer) {
    helpfulLinksContainer.innerHTML = HELPFUL_LINKS.map(link => `
      <div class="col-md-6 col-lg-6">
        <div class="card helpful-link-card shadow-sm border-0 h-100">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title">
              <i class="bi bi-${link.icon}"></i>
              ${link.title}
            </h5>
            <p class="card-text flex-grow-1">${link.description}</p>
            <a 
              href="${link.url}" 
              target="_blank" 
              rel="noopener noreferrer"
              class="btn btn-outline-primary btn-sm helpful-link-btn"
            >
              <i class="bi bi-arrow-up-right"></i>
              <span>${t(ctx.language, 'resourcesVisit')}</span>
            </a>
          </div>
        </div>
      </div>
    `).join('')
  }

  // Generate and render FAQ items
  const faqContent = host.querySelector('#faq-content')
  if (faqContent) {
    let faqHtml = ''
    for (let i = 1; i <= 10; i++) {
      const question = t(ctx.language, `faqQuestion${i}`)
      const answer = t(ctx.language, `faqAnswer${i}`)
      faqHtml += `
        <div class="faq-item mb-3">
          <div class="faq-question p-3 bg-light rounded" data-faq-index="${i}">
            <h6 class="mb-0 d-flex align-items-center gap-2">
              <i class="bi bi-chevron-right faq-icon"></i>
              ${question}
            </h6>
          </div>
          <div class="faq-answer p-3 bg-white border-start border-4 ms-0 hidden" data-faq-index="${i}">
            <p class="mb-0 text-muted">${answer}</p>
          </div>
        </div>
      `
    }
    faqContent.innerHTML = faqHtml

    // Add click handlers for FAQ items
    const faqQuestions = faqContent.querySelectorAll('.faq-question')
    faqQuestions.forEach(question => {
      question.addEventListener('click', () => {
        const index = question.getAttribute('data-faq-index')
        const answer = faqContent.querySelector(`.faq-answer[data-faq-index="${index}"]`)
        const icon = question.querySelector('.faq-icon')
        
        // Toggle answer visibility
        if (answer.classList.contains('hidden')) {
          answer.classList.remove('hidden')
          icon.style.transform = 'rotate(90deg)'
        } else {
          answer.classList.add('hidden')
          icon.style.transform = 'rotate(0deg)'
        }
      })
    })
  }

  // Handle FAQ button - show modal
  const faqBtn = host.querySelector('#faq-btn')
  if (faqBtn) {
    faqBtn.addEventListener('click', () => {
      const faqModal = new Modal(host.querySelector('#faqModal'))
      faqModal.show()
    })
  }

  // Generate and render tutorials
  const tutorialsContent = host.querySelector('#tutorials-content')
  if (tutorialsContent) {
    let tutorialsHtml = ''
    TUTORIALS.forEach((tutorial) => {
      tutorialsHtml += `
        <div class="tutorial-item mb-4 pb-3 border-bottom">
          <div class="row g-3 align-items-start">
            <div class="col-auto">
              <div class="tutorial-icon">
                <i class="bi bi-play-circle"></i>
              </div>
            </div>
            <div class="col">
              <h6 class="tutorial-title mb-2">${tutorial.title}</h6>
              <p class="tutorial-description mb-2">${tutorial.description}</p>
              <div class="tutorial-meta d-flex gap-3 mb-3">
                <span class="tutorial-duration">
                  <i class="bi bi-clock"></i> ${tutorial.duration}
                </span>
              </div>
              <a 
                href="${tutorial.url}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="btn btn-sm btn-outline-success tutorial-btn"
              >
                <i class="bi bi-play-fill"></i> Watch Now
              </a>
            </div>
          </div>
        </div>
      `
    })
    tutorialsContent.innerHTML = tutorialsHtml
  }

  // Handle Tutorials button - show modal
  const tutorialsBtn = host.querySelector('#tutorials-btn')
  if (tutorialsBtn) {
    tutorialsBtn.addEventListener('click', () => {
      const tutorialsModal = new Modal(host.querySelector('#tutorialsModal'))
      tutorialsModal.show()
    })
  }
}
