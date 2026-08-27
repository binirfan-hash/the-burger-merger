/**
 * The Burger Merger — Scrollytelling App
 * Canvas frame scrubber + GSAP ScrollTrigger + Lenis smooth scroll
 */

class BurgerScrollyApp {
    constructor() {
        this.canvas = document.getElementById('scrub-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.preloader = document.getElementById('preloader');
        this.preloaderProgress = document.querySelector('.preloader-progress');
        this.preloaderText = document.querySelector('.preloader-text');
        
        // Frame configuration
        this.sections = [
            { id: 1, frameCount: 240, path: '../assets/video-frames/section-1/frame_' },
            { id: 2, frameCount: 360, path: '../assets/video-frames/section-2/frame_' },
            { id: 3, frameCount: 240, path: '../assets/video-frames/section-3/frame_' }
        ];
        
        this.totalFrames = this.sections.reduce((sum, s) => sum + s.frameCount, 0);
        this.frames = []; // Array of loaded Image objects
        this.loadedCount = 0;
        
        // Scroll state
        this.currentSection = 0;
        this.currentFrame = 0;
        this.scrollProgress = 0;
        
        // Canvas sizing
        this.canvasWidth = 1280;
        this.canvasHeight = 720;
        
        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.render = this.render.bind(this);
        
        this.init();
    }
    
    async init() {
        this.setupCanvas();
        this.setupLenis();
        this.setupScrollTrigger();
        this.setupNavigation();
        
        // Load frames
        await this.loadFrames();
        
        // Hide preloader
        this.hidePreloader();
        
        // Start render loop
        this.render();
    }
    
    setupCanvas() {
        this.handleResize();
        window.addEventListener('resize', this.handleResize);
    }
    
    handleResize() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        // Set canvas size to match viewport
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        
        this.ctx.scale(dpr, dpr);
        this.canvasWidth = w;
        this.canvasHeight = h;
    }
    
    async loadFrames() {
        const loadPromises = [];
        
        for (const section of this.sections) {
            for (let i = 0; i < section.frameCount; i++) {
                const frameNum = String(i).padStart(4, '0');
                const src = `${section.path}${frameNum}.webp`;
                
                const promise = this.loadImage(src).then(img => {
                    this.frames.push({
                        section: section.id,
                        index: i,
                        image: img
                    });
                    this.loadedCount++;
                    this.updatePreloader();
                    return img;
                }).catch(err => {
                    console.warn(`Failed to load frame: ${src}`, err);
                    this.loadedCount++;
                    this.updatePreloader();
                    return null;
                });
                
                loadPromises.push(promise);
            }
        }
        
        // Sort frames by section and index after loading
        await Promise.all(loadPromises);
        this.frames.sort((a, b) => {
            if (a.section !== b.section) return a.section - b.section;
            return a.index - b.index;
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    
    updatePreloader() {
        const progress = (this.loadedCount / this.totalFrames) * 100;
        this.preloaderProgress.style.width = progress + '%';
        this.preloaderText.textContent = `Loading frames... ${Math.round(progress)}%`;
    }
    
    hidePreloader() {
        this.preloaderProgress.style.width = '100%';
        this.preloaderText.textContent = 'Ready!';
        
        setTimeout(() => {
            this.preloader.classList.add('hidden');
            // Animate content blocks in
            this.animateContentBlocks();
        }, 500);
    }
    
    setupLenis() {
        this.lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 2,
        });
        
        // Connect Lenis to GSAP ScrollTrigger
        this.lenis.on('scroll', ScrollTrigger.update);
        
        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });
        
        gsap.ticker.lagSmoothing(0);
    }
    
    setupScrollTrigger() {
        // Create pinned sections
        const sections = document.querySelectorAll('.scroll-section');
        
        sections.forEach((section, index) => {
            const contentBlocks = section.querySelectorAll('.content-block');
            
            // Pin each section
            ScrollTrigger.create({
                trigger: section,
                start: 'top top',
                end: '+=100%',
                pin: true,
                pinSpacing: true,
                scrub: 1,
                onUpdate: (self) => {
                    // Map scroll progress to section and frame
                    this.updateFrameFromScroll(self.progress, index);
                    this.updateContentOpacity(contentBlocks, self.progress);
                },
                onEnter: () => this.updateNavActive(index + 1),
                onEnterBack: () => this.updateNavActive(index + 1),
            });
        });
        
        // Menu section (not pinned)
        ScrollTrigger.create({
            trigger: '#menu',
            start: 'top 80%',
            onEnter: () => {
                gsap.from('.menu-card', {
                    y: 60,
                    opacity: 0,
                    duration: 0.8,
                    stagger: 0.15,
                    ease: 'power3.out'
                });
            },
            once: true
        });
    }
    
    updateFrameFromScroll(progress, sectionIndex) {
        const section = this.sections[sectionIndex];
        if (!section) return;
        
        // Map progress (0-1) to frame index
        const frameIndex = Math.floor(progress * (section.frameCount - 1));
        
        // Find the frame in our loaded frames array
        const frame = this.frames.find(f => f.section === section.id && f.index === frameIndex);
        
        if (frame && frame.image) {
            this.currentFrame = frame;
        }
    }
    
    updateContentOpacity(blocks, progress) {
        // Fade in content at start of section (0-20%)
        // Hold (20-80%)
        // Fade out at end (80-100%)
        
        blocks.forEach((block, i) => {
            let opacity = 0;
            let translateY = 40;
            
            if (progress < 0.2) {
                // Fade in
                const p = progress / 0.2;
                opacity = p;
                translateY = 40 * (1 - p);
            } else if (progress < 0.8) {
                // Hold
                opacity = 1;
                translateY = 0;
            } else {
                // Fade out
                const p = (progress - 0.8) / 0.2;
                opacity = 1 - p;
                translateY = -40 * p;
            }
            
            // Stagger the blocks slightly
            const staggerOffset = i * 0.05;
            const adjustedProgress = Math.max(0, Math.min(1, progress - staggerOffset));
            
            block.style.opacity = opacity;
            block.style.transform = `translateY(${translateY}px)`;
        });
    }
    
    setupNavigation() {
        const nav = document.querySelector('.main-nav');
        
        // Add scroll class to nav
        ScrollTrigger.create({
            start: 'top -100',
            onUpdate: (self) => {
                if (self.scroll() > 100) {
                    nav.classList.add('scrolled');
                } else {
                    nav.classList.remove('scrolled');
                }
            }
        });
        
        // Nav link clicks
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('href');
                const section = document.querySelector(target);
                if (section) {
                    this.lenis.scrollTo(section);
                }
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
    
    animateContentBlocks() {
        document.querySelectorAll('.content-block').forEach(block => {
            block.style.opacity = '0';
            block.style.transform = 'translateY(40px)';
            block.style.transition = 'opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        });
    }
    
    render() {
        if (this.currentFrame && this.currentFrame.image) {
            const img = this.currentFrame.image;
            
            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            
            // Calculate cover-fit dimensions
            const canvasAspect = this.canvasWidth / this.canvasHeight;
            const imgAspect = img.width / img.height;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (canvasAspect > imgAspect) {
                // Canvas is wider than image - fill width, crop height
                drawWidth = this.canvasWidth;
                drawHeight = this.canvasWidth / imgAspect;
                drawX = 0;
                drawY = (this.canvasHeight - drawHeight) / 2;
            } else {
                // Canvas is taller than image - fill height, crop width
                drawHeight = this.canvasHeight;
                drawWidth = this.canvasHeight * imgAspect;
                drawX = (this.canvasWidth - drawWidth) / 2;
                drawY = 0;
            }
            
            // Draw image with cover fit
            this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        }
        
        requestAnimationFrame(this.render);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.burgerApp = new BurgerScrollyApp();
});
