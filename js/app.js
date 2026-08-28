/**
 * THE BURGER MERGER — Cinematic Scrollytelling Engine
 * 
 * Performance Optimizations:
 * - 24fps frame capping with delta timing
 * - Progressive loading with priority queue
 * - Frame skipping on fast scrolls
 * - Touch events for mobile
 * - IntersectionObserver for lazy content
 * - GPU-accelerated transforms
 */

class CinematicScrolly {
    constructor() {
        this.canvas = document.getElementById('scrub-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.preloader = document.getElementById('preloader');
        this.preloaderProgress = document.querySelector('.preloader-progress');
        this.preloaderText = document.querySelector('.preloader-text');
        this.transitionOverlay = document.getElementById('transition-overlay');

        // 24fps timing
        this.FPS = 24;
        this.FRAME_INTERVAL = 1000 / this.FPS;
        this.lastFrameTime = 0;
        this.accumulator = 0;

        // Section configuration
        this.sections = [
            { id: 1, frameCount: 240, path: 'assets/video-frames/section-1/frame_', name: 'Foundation' },
            { id: 2, frameCount: 360, path: 'assets/video-frames/section-2/frame_', name: 'Build' },
            { id: 3, frameCount: 240, path: 'assets/video-frames/section-3/frame_', name: 'Crown' }
        ];

        // Frame cache: sectionId -> Map(index -> Image)
        this.frameCache = new Map();
        this.sections.forEach(s => this.frameCache.set(s.id, new Map()));
        
        // Priority loading queue
        this.loadQueue = [];
        this.isProcessingQueue = false;

        // Render state
        this.currentSection = 0;
        this.currentFrameIndex = 0;
        this.targetFrameIndex = 0;
        this.previousFrameImage = null;
        this.crossfadeAlpha = 1;

        // Smoothing
        this.frameLerpSpeed = 0.15;
        this.lastRenderTime = 0;
        this.isSectionTransitioning = false;
        
        // Scroll velocity tracking
        this.lastScrollProgress = 0;
        this.scrollVelocity = 0;

        // Canvas sizing
        this.dpr = Math.min(window.devicePixelRatio, 2);
        this.canvasWidth = 0;
        this.canvasHeight = 0;

        // RAF ID
        this.rafId = null;

        // Section 3 hold state
        this.section3HoldFrame = null;

        // Touch handling
        this.touchStartY = 0;
        this.isTouching = false;

        this.init();
    }

    async init() {
        this.setupCanvas();
        this.setupResize();
        this.setupTouchEvents();
        
        await this.preloadInitialFrames();
        
        this.hidePreloader();
        this.setupLenis();
        this.setupScrollTrigger();
        this.setupNavigation();
        this.setupMenuTouch();
        this.startRenderLoop();
    }

    setupCanvas() {
        this.resizeCanvas();
    }

    setupResize() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.resizeCanvas(), 100);
        });
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

    setupTouchEvents() {
        // Prevent zoom on double-tap
        document.addEventListener('touchend', (e) => {
            if (e.target.closest('.burger-item')) {
                e.preventDefault();
            }
        }, { passive: false });

        // Smooth touch scroll handling
        document.addEventListener('touchstart', (e) => {
            this.isTouching = true;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchend', () => {
            this.isTouching = false;
        }, { passive: true });
    }

    async preloadInitialFrames() {
        const promises = [];
        
        for (const section of this.sections) {
            // Load first 5 frames of each section (reduced for faster startup)
            for (let i = 0; i < Math.min(5, section.frameCount); i++) {
                promises.push(this.loadFrame(section.id, i, section.path));
            }
            // Also load last frame (for Section 3 hold)
            promises.push(this.loadFrame(section.id, section.frameCount - 1, section.path));
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
                end: () => `+=${section.frameCount * 18}`,
                pin: true,
                pinSpacing: true,
                scrub: 0.5,
                
                onUpdate: (self) => {
                    const progress = self.progress;
                    
                    // Calculate scroll velocity for adaptive loading
                    this.scrollVelocity = Math.abs(progress - this.lastScrollProgress);
                    this.lastScrollProgress = progress;
                    
                    // Calculate frame index
                    let frameIndex;
                    
                    if (index === 2) {
                        // Section 3: Hold on final frame
                        frameIndex = section.frameCount - 1;
                        this.section3HoldFrame = frameIndex;
                    } else {
                        // Normal playback with 24fps capping
                        frameIndex = Math.min(
                            Math.floor(progress * (section.frameCount - 1)),
                            section.frameCount - 1
                        );
                    }
                    
                    this.targetFrameIndex = frameIndex;
                    this.currentSection = index;
                    
                    // Adaptive loading based on scroll velocity
                    const preloadCount = this.scrollVelocity > 0.01 ? 10 : 4;
                    this.preloadAhead(section.id, frameIndex, preloadCount);
                    
                    // Text animations
                    this.animateText(textElements, progress);
                },
                
                onEnter: () => this.updateNavActive(index + 1),
                onEnterBack: () => this.updateNavActive(index + 1),
                
                onLeave: () => this.startSectionTransition(index + 1),
                onLeaveBack: () => this.startSectionTransition(index - 1)
            });
        });

        // Menu section with IntersectionObserver
        const menuObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    gsap.from('.menu-title', {
                        y: 40, opacity: 0, duration: 1, ease: 'power3.out'
                    });
                    gsap.from('.burger-item', {
                        y: 80, opacity: 0, duration: 1.2, stagger: 0.2, ease: 'power3.out', delay: 0.2
                    });
                    menuObserver.disconnect();
                }
            });
        }, { threshold: 0.15 });
        
        const menuSection = document.getElementById('menu');
        if (menuSection) menuObserver.observe(menuSection);

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

        // Add to priority queue
        for (let i = 1; i <= count; i++) {
            const nextIndex = currentIndex + i;
            if (nextIndex < section.frameCount && !this.getFrame(sectionId, nextIndex)) {
                this.loadQueue.push({ sectionId, index: nextIndex, path: section.path });
            }
        }
        
        this.processLoadQueue();
    }

    async processLoadQueue() {
        if (this.isProcessingQueue || this.loadQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        // Process queue in batches of 3
        while (this.loadQueue.length > 0) {
            const batch = this.loadQueue.splice(0, 3);
            await Promise.all(batch.map(item => this.loadFrame(item.sectionId, item.index, item.path)));
        }
        
        this.isProcessingQueue = false;
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
            // GPU acceleration
            el.style.willChange = 'transform, opacity';
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

    setupMenuTouch() {
        const burgerItems = document.querySelectorAll('.burger-item');
        
        burgerItems.forEach(item => {
            // Touch support for mobile
            item.addEventListener('touchstart', (e) => {
                e.preventDefault();
                burgerItems.forEach(bi => bi.classList.remove('touched'));
                item.classList.add('touched');
            }, { passive: false });
            
            item.addEventListener('touchend', () => {
                setTimeout(() => {
                    item.classList.remove('touched');
                }, 300);
            });
            
            // Keep hover for desktop
            item.addEventListener('mouseenter', () => {
                item.style.transitionDelay = '0s';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.transitionDelay = '0.1s';
            });
        });
        
        // Tap outside to reset
        document.addEventListener('touchstart', (e) => {
            if (!e.target.closest('.burger-item')) {
                burgerItems.forEach(bi => bi.classList.remove('touched'));
            }
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
            // 24fps cap using delta timing
            const delta = timestamp - this.lastFrameTime;
            
            if (delta >= this.FRAME_INTERVAL) {
                this.lastFrameTime = timestamp - (delta % this.FRAME_INTERVAL);
                this.updateFrame(delta);
                this.render();
            }
            
            this.rafId = requestAnimationFrame(loop);
        };
        
        this.rafId = requestAnimationFrame(loop);
    }

    updateFrame(dt) {
        const section = this.sections[this.currentSection];
        if (!section) return;

        // Smooth lerp with adaptive speed based on scroll velocity
        const diff = this.targetFrameIndex - this.currentFrameIndex;
        
        if (Math.abs(diff) > 0.1) {
            // Faster lerp when scrolling fast, slower when idle
            const adaptiveSpeed = Math.min(0.3, this.frameLerpSpeed + this.scrollVelocity * 2);
            this.currentFrameIndex += diff * adaptiveSpeed;
        } else {
            this.currentFrameIndex = this.targetFrameIndex;
        }

        this.currentFrameIndex = Math.max(0, Math.min(this.currentFrameIndex, section.frameCount - 1));
    }

    render() {
        const section = this.sections[this.currentSection];
        if (!section) return;

        const frameIdx = Math.round(this.currentFrameIndex);
        const frame = this.getFrame(section.id, frameIdx);

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

// Service Worker for offline caching (optional enhancement)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Cache key frames for faster repeat visits
        // Not implementing full SW to keep it simple
    });
}
