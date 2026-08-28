/**
 * THE BURGER MERGER — Cinematic Scrollytelling Engine
 * 
 * Section Flow:
 * - Section 1: Foundation (240 frames) — bun placed on plate
 * - Section 2: The Build (360 frames) — ingredients layered
 * - Section 3: The Crown (240 frames) — top bun placed, then holds
 * - Menu: 3 burger cards with hover highlight/greyout
 */

class CinematicScrolly {
    constructor() {
        this.canvas = document.getElementById('scrub-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.preloader = document.getElementById('preloader');
        this.preloaderProgress = document.querySelector('.preloader-progress');
        this.preloaderText = document.querySelector('.preloader-text');
        this.transitionOverlay = document.getElementById('transition-overlay');

        // Section configuration
        this.sections = [
            { id: 1, frameCount: 240, path: 'assets/video-frames/section-1/frame_', name: 'Foundation' },
            { id: 2, frameCount: 360, path: 'assets/video-frames/section-2/frame_', name: 'Build' },
            { id: 3, frameCount: 240, path: 'assets/video-frames/section-3/frame_', name: 'Crown' }
        ];

        // Frame cache: sectionId -> Map(index -> Image)
        this.frameCache = new Map();
        this.sections.forEach(s => this.frameCache.set(s.id, new Map()));

        // Render state
        this.currentSection = 0;
        this.currentFrameIndex = 0;
        this.targetFrameIndex = 0;
        this.previousFrameImage = null;
        this.crossfadeAlpha = 1;

        // Smoothing
        this.frameLerpSpeed = 0.1;
        this.lastRenderTime = 0;
        this.isSectionTransitioning = false;

        // Canvas sizing
        this.dpr = Math.min(window.devicePixelRatio, 2);
        this.canvasWidth = 0;
        this.canvasHeight = 0;

        // RAF ID
        this.rafId = null;

        // Section 3 hold state
        this.section3HoldFrame = null;
        this.section3BreathingPhase = 0;

        this.init();
    }

    async init() {
        this.setupCanvas();
        this.setupResize();
        
        await this.preloadInitialFrames();
        
        this.hidePreloader();
        this.setupLenis();
        this.setupScrollTrigger();
        this.setupNavigation();
        this.setupMenuHover();
        this.startRenderLoop();
    }

    setupCanvas() {
        this.resizeCanvas();
    }

    setupResize() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        this.canvas.width = w * this.dpr;
        this.canvas.height = h * this.dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        
        this.ctx.scale(this.dpr, this.dpr);
        this.canvasWidth = w;
        this.canvasHeight = h;
    }

    async preloadInitialFrames() {
        const promises = [];
        
        for (const section of this.sections) {
            // Load first 8 frames of each section
            for (let i = 0; i < Math.min(8, section.frameCount); i++) {
                promises.push(this.loadFrame(section.id, i, section.path));
            }
            // Also load last frame (for Section 3 hold)
            if (section.id === 3) {
                promises.push(this.loadFrame(section.id, section.frameCount - 1, section.path));
            }
        }
        
        let loaded = 0;
        const total = promises.length;
        
        for (const promise of promises) {
            await promise;
            loaded++;
            const progress = (loaded / total) * 100;
            this.preloaderProgress.style.width = progress + '%';
        }
    }

    loadFrame(sectionId, index, path) {
        const cache = this.frameCache.get(sectionId);
        if (cache.has(index)) return Promise.resolve(cache.get(index));

        const frameNum = String(index + 1).padStart(4, '0');
        const src = `${path}${frameNum}.webp`;

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                cache.set(index, img);
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`Failed: ${src}`);
                resolve(null);
            };
            img.src = src;
        });
    }

    getFrame(sectionId, index) {
        const cache = this.frameCache.get(sectionId);
        return cache ? cache.get(index) : null;
    }

    hidePreloader() {
        this.preloaderProgress.style.width = '100%';
        this.preloaderText.textContent = 'Ready';
        
        setTimeout(() => {
            this.preloader.classList.add('hidden');
        }, 400);
    }

    setupLenis() {
        this.lenis = new Lenis({
            duration: 1.8,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 0.7,
            touchMultiplier: 1.5,
        });

        this.lenis.on('scroll', ScrollTrigger.update);
        
        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });
        
        gsap.ticker.lagSmoothing(0);
    }

    setupScrollTrigger() {
        const sectionElements = document.querySelectorAll('.scroll-section');
        
        sectionElements.forEach((sectionEl, index) => {
            const section = this.sections[index];
            const textElements = sectionEl.querySelectorAll('.section-number, .section-title, .section-body, .section-tags, .pricing-block');
            
            ScrollTrigger.create({
                trigger: sectionEl,
                start: 'top top',
                end: () => `+=${section.frameCount * 20}`,
                pin: true,
                pinSpacing: true,
                scrub: 0.6,
                
                onUpdate: (self) => {
                    const progress = self.progress;
                    
                    // Calculate frame index with section-specific logic
                    let frameIndex;
                    
                    if (index === 2) {
                        // Section 3: Hero Shot Hold — show completed burger for entire section
                        // Since Section 3 video is same as Section 2, we hold the final frame
                        // This creates a cinematic "hero reveal" of the finished burger
                        frameIndex = section.frameCount - 1;
                        this.section3HoldFrame = frameIndex;
                    } else {
                        // Sections 1 & 2: normal playback
                        frameIndex = Math.min(
                            Math.floor(progress * (section.frameCount - 1)),
                            section.frameCount - 1
                        );
                    }
                    
                    this.targetFrameIndex = frameIndex;
                    this.currentSection = index;
                    
                    // Progressive loading
                    this.preloadAhead(section.id, frameIndex, 6);
                    
                    // Text animations
                    this.animateText(textElements, progress);
                },
                
                onEnter: () => this.updateNavActive(index + 1),
                onEnterBack: () => this.updateNavActive(index + 1),
                
                onLeave: () => this.startSectionTransition(index + 1),
                onLeaveBack: () => this.startSectionTransition(index - 1)
            });
        });

        // Menu section
        ScrollTrigger.create({
            trigger: '#menu',
            start: 'top 85%',
            onEnter: () => {
                gsap.from('.menu-title', {
                    y: 40, opacity: 0, duration: 1, ease: 'power3.out'
                });
                gsap.from('.burger-item', {
                    y: 80, opacity: 0, duration: 1.2, stagger: 0.2, ease: 'power3.out', delay: 0.2
                });
            },
            once: true
        });

        // Nav background
        ScrollTrigger.create({
            trigger: 'body',
            start: 'top -100',
            onUpdate: (self) => {
                const nav = document.querySelector('.main-nav');
                if (self.scroll() > 100) {
                    nav.style.background = 'rgba(10,10,10,0.9)';
                } else {
                    nav.style.background = 'linear-gradient(to bottom, rgba(10,10,10,0.8) 0%, transparent 100%)';
                }
            }
        });
    }

    preloadAhead(sectionId, currentIndex, count) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;

        for (let i = 1; i <= count; i++) {
            const nextIndex = currentIndex + i;
            if (nextIndex < section.frameCount && !this.getFrame(sectionId, nextIndex)) {
                this.loadFrame(sectionId, nextIndex, section.path);
            }
        }
    }

    animateText(elements, progress) {
        elements.forEach((el, i) => {
            const adjustedProgress = Math.max(0, Math.min(1, progress));
            
            let opacity = 0;
            let translateY = 40;
            
            if (adjustedProgress < 0.15) {
                const p = adjustedProgress / 0.15;
                opacity = Math.min(1, p * 1.5);
                translateY = 40 * (1 - Math.min(1, p * 1.5));
            } else if (adjustedProgress < 0.85) {
                opacity = 1;
                translateY = 0;
            } else {
                const p = (adjustedProgress - 0.85) / 0.15;
                opacity = Math.max(0, 1 - p * 1.5);
                translateY = -30 * Math.min(1, p * 1.5);
            }
            
            el.style.opacity = opacity;
            el.style.transform = `translateY(${translateY}px)`;
        });
    }

    startSectionTransition(targetSectionIndex) {
        if (targetSectionIndex >= 0 && targetSectionIndex < this.sections.length) {
            gsap.to(this.transitionOverlay, {
                opacity: 0.3,
                duration: 0.2,
                ease: 'power2.in',
                onComplete: () => {
                    gsap.to(this.transitionOverlay, {
                        opacity: 0,
                        duration: 0.4,
                        ease: 'power2.out'
                    });
                }
            });
        }
    }

    setupNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('href');
                const section = document.querySelector(target);
                if (section) {
                    this.lenis.scrollTo(section, { duration: 2 });
                }
            });
        });
    }

    setupMenuHover() {
        // CSS handles the hover dimming effect
        // Add any JS enhancements here if needed
        const burgerItems = document.querySelectorAll('.burger-item');
        
        burgerItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                // Optional: sound effect or additional animation
                item.style.transitionDelay = '0s';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.transitionDelay = '0.1s';
            });
        });
    }

    updateNavActive(sectionNum) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (parseInt(link.dataset.section) === sectionNum) {
                link.classList.add('active');
            }
        });
    }

    startRenderLoop() {
        const loop = (timestamp) => {
            const dt = timestamp - this.lastRenderTime;
            this.lastRenderTime = timestamp;
            
            this.updateFrame(dt);
            this.render();
            
            this.rafId = requestAnimationFrame(loop);
        };
        
        this.rafId = requestAnimationFrame(loop);
    }

    updateFrame(dt) {
        const section = this.sections[this.currentSection];
        if (!section) return;

        // Smooth lerp
        const diff = this.targetFrameIndex - this.currentFrameIndex;
        
        if (Math.abs(diff) > 0.1) {
            const speed = Math.min(0.25, this.frameLerpSpeed + Math.abs(diff) * 0.02);
            this.currentFrameIndex += diff * speed;
        } else {
            this.currentFrameIndex = this.targetFrameIndex;
        }

        this.currentFrameIndex = Math.max(0, Math.min(this.currentFrameIndex, section.frameCount - 1));
    }

    render() {
        const section = this.sections[this.currentSection];
        if (!section) return;

        let frameIdx = Math.round(this.currentFrameIndex);
        let frame = this.getFrame(section.id, frameIdx);

        // For Section 3 breathing effect
        if (this.currentSection === 2 && this.section3BreathingPhase > 0) {
            // Subtle scale breathing on the held frame
            // Use CSS-like effect by slightly adjusting position
        }

        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        if (frame && frame.complete) {
            this.drawCoverImage(frame);
        }
    }

    drawCoverImage(img) {
        const canvasAspect = this.canvasWidth / this.canvasHeight;
        const imgAspect = img.width / img.height;

        let drawWidth, drawHeight, drawX, drawY;

        if (canvasAspect > imgAspect) {
            drawWidth = this.canvasWidth;
            drawHeight = this.canvasWidth / imgAspect;
            drawX = 0;
            drawY = (this.canvasHeight - drawHeight) / 2;
        } else {
            drawHeight = this.canvasHeight;
            drawWidth = this.canvasHeight * imgAspect;
            drawX = (this.canvasWidth - drawWidth) / 2;
            drawY = 0;
        }

        this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }

    destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this.lenis) this.lenis.destroy();
        ScrollTrigger.getAll().forEach(t => t.kill());
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.scrolly = new CinematicScrolly();
});

// Tab visibility
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.scrolly) {
        ScrollTrigger.refresh();
    }
});
