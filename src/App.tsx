import React, { useState, useEffect, useRef } from "react";
import {
  Film,
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Sparkles,
  RefreshCw,
  Tv,
  Plus,
  Maximize,
  Trash2,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  Video,
  ChevronRight,
  Info,
  Layers,
  Award,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AspectRatio, Resolution, ImageInput, VideoGeneration, VideoMetadata } from "./types";
import { PRESET_SCENES } from "./data";

// Rendering/polling reassuring messages
const REASSURING_MESSAGES = [
  "Setting up the directors chair...",
  "Powering up the high-performance Veo engine...",
  "Stitching cinematic temporal frames...",
  "Calibrating motion vectors and physics simulation...",
  "Polishing realistic lighting and volumetric fog...",
  "Rendering individual color-graded pixels...",
  "Smoothing camera motion paths...",
  "Applying final cinematic layers and soundscapes...",
  "Completing final color grade in high-contrast tone...",
  "Readying the red carpet premiere...",
];

export default function App() {
  // General state
  const [prompt, setPrompt] = useState<string>("");
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [imageInput, setImageInput] = useState<ImageInput | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Active generation state
  const [status, setStatus] = useState<"idle" | "generating" | "polling" | "done" | "error">("idle");
  const [operationName, setOperationName] = useState<string>("");
  const [activeMessageIndex, setActiveMessageIndex] = useState<number>(0);
  const [generationError, setGenerationError] = useState<string>("");
  const [activeGeneration, setActiveGeneration] = useState<VideoGeneration | null>(null);

  // History & Movie Library state
  const [movieLibrary, setMovieLibrary] = useState<VideoGeneration[]>([]);

  // Video extension state
  const [isExtending, setIsExtending] = useState<boolean>(false);
  const [extensionPrompt, setExtensionPrompt] = useState<string>("");
  const [extendingParentId, setExtendingParentId] = useState<string | null>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Server health state
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(true);

  // Load history from local storage
  useEffect(() => {
    const saved = localStorage.getItem("veo_movie_library");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMovieLibrary(parsed);
        if (parsed.length > 0) {
          setActiveGeneration(parsed[0]);
          setStatus("done");
        }
      } catch (e) {
        console.error("Failed to parse movie library", e);
      }
    }

    // Check server health and API key setup
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setApiKeyConfigured(data.apiKeyConfigured);
      })
      .catch((err) => {
        console.error("Server API key check failed:", err);
      });
  }, []);

  // Save history to local storage
  const saveToLibrary = (newLibrary: VideoGeneration[]) => {
    setMovieLibrary(newLibrary);
    localStorage.setItem("veo_movie_library", JSON.stringify(newLibrary));
  };

  // Cycling loading messages
  useEffect(() => {
    let interval: any;
    if (status === "generating" || status === "polling") {
      interval = setInterval(() => {
        setActiveMessageIndex((prev) => (prev + 1) % REASSURING_MESSAGES.length);
      }, 5500);
    } else {
      setActiveMessageIndex(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  // Handle Poll Status
  useEffect(() => {
    let pollInterval: any;

    if (status === "polling" && operationName) {
      const poll = async () => {
        try {
          const response = await fetch("/api/video-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operationName }),
          });

          const data = await response.json();

          if (data.error) {
            setStatus("error");
            setGenerationError(data.error.message || "Upstream generation failed.");
            return;
          }

          if (data.done) {
            clearInterval(pollInterval);
            console.log("Video generation finished! Preparing download URL...");

            // Create generation record
            const videoUrl = `/api/video-download`; // Post request handles secure download
            const newGen: VideoGeneration = {
              id: Math.random().toString(36).substring(2, 9),
              operationName: operationName,
              title: prompt.split(" ").slice(0, 3).join(" ") || "Epic Cinematic",
              prompt: prompt || "Extended scene",
              aspectRatio,
              resolution,
              timestamp: Date.now(),
              videoUrl,
              videoMetadata: data.videoMetadata,
              baseImagePreview: imageInput?.previewUrl,
              isExtension: isExtending,
              parentId: extendingParentId || undefined,
            };

            const updatedLib = [newGen, ...movieLibrary];
            saveToLibrary(updatedLib);
            setActiveGeneration(newGen);
            setStatus("done");

            // Reset forms
            setImageInput(null);
            setPrompt("");
            setIsExtending(false);
            setExtendingParentId(null);
          }
        } catch (e: any) {
          console.error("Polling error:", e);
        }
      };

      // Poll every 5 seconds
      pollInterval = setInterval(poll, 5000);
      poll(); // initial poll immediate
    }

    return () => clearInterval(pollInterval);
  }, [status, operationName]);

  // Handle Start Generation
  const handleStartGeneration = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt && !imageInput && !selectedScene) return;

    setStatus("generating");
    setGenerationError("");

    try {
      const requestBody: any = {
        prompt: prompt || PRESET_SCENES.find((s) => s.id === selectedScene)?.presetPrompt,
        aspectRatio,
        resolution,
      };

      if (imageInput) {
        requestBody.image = {
          data: imageInput.data,
          mimeType: imageInput.mimeType,
        };
      }

      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.operationName) {
        setOperationName(data.operationName);
        setStatus("polling");
      } else {
        setStatus("error");
        setGenerationError(data.error || "Failed to initiate video generation.");
      }
    } catch (err: any) {
      setStatus("error");
      setGenerationError(err.message || "Failed to make network request.");
    }
  };

  // Handle Extend Video
  const handleExtendGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extensionPrompt || !activeGeneration?.videoMetadata) return;

    setStatus("generating");
    setGenerationError("");
    setIsExtending(true);
    setExtendingParentId(activeGeneration.id);

    try {
      const requestBody = {
        prompt: extensionPrompt,
        aspectRatio: activeGeneration.aspectRatio,
        resolution: activeGeneration.resolution,
        previousVideo: activeGeneration.videoMetadata, // pass the previous video object
      };

      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.operationName) {
        // Use extension prompt as main prompt for the new node
        setPrompt(extensionPrompt);
        setOperationName(data.operationName);
        setExtensionPrompt("");
        setStatus("polling");
      } else {
        setStatus("error");
        setGenerationError(data.error || "Failed to extend the video.");
      }
    } catch (err: any) {
      setStatus("error");
      setGenerationError(err.message || "Failed to make extension request.");
    }
  };

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file);
  };

  const processFile = (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImageInput({
        data: base64,
        mimeType: file.type,
        previewUrl: URL.createObjectURL(file),
      });
      // De-select scene preset if custom file is uploaded
      setSelectedScene("");
    };
    reader.readAsDataURL(file);
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  };

  // Preset Selection
  const handleSelectPreset = (sceneId: string) => {
    setSelectedScene(sceneId);
    const scene = PRESET_SCENES.find((s) => s.id === sceneId);
    if (scene) {
      setPrompt(scene.presetPrompt);
      setAspectRatio(scene.aspectRatio);
      setImageInput(null); // Clear manual upload
    }
  };

  // Video Player control helpers
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleVideoDownload = async (gen: VideoGeneration) => {
    try {
      console.log("Triggering video proxy download...");
      const response = await fetch("/api/video-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationName: gen.operationName }),
      });

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${gen.title.replace(/\s+/g, "_")}_veo.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download video:", err);
      alert("Failed to download video. Please check if the operation has expired.");
    }
  };

  const deleteFromLibrary = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = movieLibrary.filter((item) => item.id !== id);
    saveToLibrary(updated);
    if (activeGeneration?.id === id) {
      if (updated.length > 0) {
        setActiveGeneration(updated[0]);
      } else {
        setActiveGeneration(null);
        setStatus("idle");
      }
    }
  };

  return (
    <div id="main-director-room" className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans selection:bg-orange-500 selection:text-black flex flex-col relative overflow-x-hidden">
      
      {/* Absolute Ambient Background Layer */}
      <div className="absolute top-0 right-0 w-1/2 h-full z-0 opacity-20 pointer-events-none">
        <div className="w-full h-full bg-gradient-to-l from-orange-600/10 to-transparent"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-96 h-96 border border-white/5 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Cinematic Navigation Header */}
      <nav className="flex justify-between items-center px-6 sm:px-10 py-8 z-20 border-b border-white/10 relative">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500 text-black shadow-lg shadow-orange-500/15">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black tracking-tighter uppercase text-white leading-none">VEO CINEMA</div>
            <div className="text-[9px] text-white/40 font-mono tracking-widest mt-1 uppercase">MODEL_VEO_3.1_FAST</div>
          </div>
        </div>

        <div className="hidden lg:flex gap-12 text-[10px] font-bold tracking-[0.25em] uppercase opacity-60">
          <span className="hover:opacity-100 transition-opacity cursor-default">DIRECTOR&apos;S CUT</span>
          <span className="hover:opacity-100 transition-opacity cursor-default">ARCHIVES</span>
          <span className="hover:opacity-100 transition-opacity cursor-default">LIVE SCOPE</span>
        </div>

        <div className="flex items-center gap-4">
          {!apiKeyConfigured && (
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>CONFIGURE SECRETS</span>
            </div>
          )}
          <div className="w-10 h-10 border border-white/20 rounded-full flex items-center justify-center bg-white/5 hover:border-orange-500 transition-colors cursor-pointer">
            <div className="w-4 h-0.5 bg-white"></div>
          </div>
        </div>
      </nav>

      {/* Under-Header Welcome & Definition bar */}
      <div className="px-6 sm:px-10 pt-10 pb-4 relative z-10">
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <span className="px-2 py-0.5 border border-white/30 text-[9px] font-bold tracking-widest uppercase">Premiere</span>
          <span className="text-[9px] font-bold tracking-widest uppercase opacity-50 underline underline-offset-4">8K Ultra Definition Synthesis</span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.9] text-white max-w-4xl">
          ECLIPSE OF TIME
        </h1>
        <p className="text-sm font-light opacity-60 max-w-2xl mt-3 leading-relaxed">
          An interactive cinematic odyssey through the fragments of spatial temporal video synthesis. Direct your own motion paths, light directions, and scene progressions with Google Gen AI Veo.
        </p>
      </div>

      {/* Main Studio Console Grid */}
      <main className="max-w-7xl mx-auto px-6 sm:px-10 py-6 grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10 w-full flex-1">
        
        {/* LEFT COLUMN: Controls & Prompts (5 Cols) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Generation Configuration Block */}
          <section id="producer-station" className="bg-white/[0.02] border border-white/10 rounded-none p-6 shadow-2xl relative overflow-hidden">
            {/* Top decorative orange line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-orange-500"></div>

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Award className="text-orange-500 w-5 h-5" />
                <h2 className="font-black text-white uppercase tracking-tight text-sm">DIRECTOR&apos;S CONSOLE</h2>
              </div>
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
            </div>

            <form onSubmit={handleStartGeneration} className="space-y-6">
              {/* Scene presets carousel */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">
                    1. SELECT PRESET SCRIPT
                  </label>
                  {selectedScene && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScene("");
                        setPrompt("");
                      }}
                      className="text-[10px] font-bold tracking-wider uppercase text-orange-500 hover:text-orange-400"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRESET_SCENES.map((scene) => (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => handleSelectPreset(scene.id)}
                      className={`p-3 rounded-none border text-left transition-all duration-200 relative group flex flex-col justify-between h-24 ${
                        selectedScene === scene.id
                          ? "border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/5"
                          : "border-white/10 bg-white/[0.01] hover:border-white/30 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="text-xl group-hover:scale-110 transition duration-200">
                        {scene.imageThumbnail}
                      </span>
                      <div>
                        <div className="text-[10px] font-bold text-white truncate group-hover:text-orange-400 uppercase tracking-tight">
                          {scene.title}
                        </div>
                        <div className="text-[8px] text-white/40 font-mono truncate uppercase tracking-widest mt-0.5">
                          {scene.tagline}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60 flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
                  2. STARTING FRAME (IMAGE-TO-VIDEO)
                </label>
                
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border border-dashed rounded-none p-4 text-center transition duration-200 cursor-pointer ${
                    isDragging
                      ? "border-orange-500 bg-orange-500/5"
                      : imageInput
                      ? "border-orange-500/30 bg-white/[0.02]"
                      : "border-white/10 hover:border-white/20 bg-white/[0.01]"
                  }`}
                >
                  <input
                    type="file"
                    id="file-input"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />

                  {imageInput ? (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={imageInput.previewUrl}
                          alt="Starting Image"
                          className="w-16 h-16 object-cover border border-white/15"
                        />
                        <div className="text-left">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-white">Starting Frame Loaded</p>
                          <p className="text-[9px] text-white/40 font-mono">
                            {imageInput.mimeType.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImageInput(null)}
                        className="p-2 bg-white/5 hover:bg-orange-950 hover:text-orange-400 border border-white/10 transition-colors"
                        title="Remove Image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="file-input" className="cursor-pointer block py-4">
                      <Upload className="w-7 h-7 text-white/30 mx-auto mb-2" />
                      <p className="text-[11px] text-white/70 tracking-wide uppercase">
                        Drag & drop raw frame, or <span className="text-orange-500 font-bold underline">browse</span>
                      </p>
                      <p className="text-[9px] text-white/40 font-mono mt-1">PNG, JPEG, WEBP (Landscape Recommended)</p>
                    </label>
                  )}
                </div>
              </div>

              {/* Text Prompts */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">
                  3. SPATIAL MOTION PROMPT
                </label>
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      setSelectedScene(""); // clear preset badge if edited
                    }}
                    placeholder="Describe camera movement, volumetric light shifting, or key interactions... (e.g. Cinematic rotation around a mysterious key object, cinematic backlight)"
                    className="w-full bg-black/60 border border-white/10 focus:border-orange-500 focus:outline-none rounded-none p-4 text-xs text-white placeholder-white/20 h-28 resize-none transition-colors duration-200 font-sans leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 pointer-events-none">
                    <span className="text-[8px] text-white/30 font-mono tracking-widest uppercase">DIRECTOR ENGINE</span>
                  </div>
                </div>
              </div>

              {/* Render Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">
                    Aspect Ratio
                  </label>
                  <div className="flex bg-black/60 p-1 rounded-none border border-white/10">
                    <button
                      type="button"
                      onClick={() => setAspectRatio("16:9")}
                      className={`flex-1 py-2 text-[10px] font-bold tracking-wider uppercase transition-all ${
                        aspectRatio === "16:9"
                          ? "bg-white text-black font-black"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      16:9 Wide
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspectRatio("9:16")}
                      className={`flex-1 py-2 text-[10px] font-bold tracking-wider uppercase transition-all ${
                        aspectRatio === "9:16"
                          ? "bg-white text-black font-black"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      9:16 Tall
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">
                    Resolution
                  </label>
                  <div className="flex bg-black/60 p-1 rounded-none border border-white/10">
                    <button
                      type="button"
                      onClick={() => setResolution("720p")}
                      className={`flex-1 py-2 text-[10px] font-bold tracking-wider uppercase transition-all ${
                        resolution === "720p"
                          ? "bg-white text-black font-black"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      720p (Fast)
                    </button>
                    <button
                      type="button"
                      onClick={() => setResolution("1080p")}
                      className={`flex-1 py-2 text-[10px] font-bold tracking-wider uppercase transition-all ${
                        resolution === "1080p"
                          ? "bg-white text-black font-black"
                          : "text-white/40 hover:text-white/80"
                      }`}
                    >
                      1080p (HQ)
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <button
                type="submit"
                disabled={status === "generating" || status === "polling" || (!prompt && !imageInput)}
                className="w-full bg-white text-black hover:bg-orange-500 hover:text-white disabled:bg-white/5 disabled:text-white/20 font-black py-4 px-6 rounded-none flex items-center justify-center gap-2 transition-all duration-200 tracking-widest uppercase cursor-pointer"
              >
                {status === "generating" || status === "polling" ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
                    <span>RENDERING SCENE...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>RENDER MOVIE CLIP</span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Quick instructions widget */}
          <div className="bg-white/[0.01] border border-white/10 rounded-none p-5 flex items-start gap-4">
            <Info className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-white">WORKSPACE PROTOCOL</h4>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Veo AI models generate video by solving spatial-temporal diffusion fields. Render takes 1-3 minutes. Once complete, you may append clips seamlessly with the <span className="text-orange-400 font-bold underline">Extend</span> tool.
              </p>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Cinematic Screen & Library (7 Cols) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Main Theater Screen Container */}
          <section id="theater-screen" className="bg-white/[0.02] border border-white/10 rounded-none p-6 shadow-2xl overflow-hidden relative flex flex-col items-center">
            
            <div className="w-full flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-orange-500" />
                <span className="text-[10px] font-black text-white tracking-[0.2em] uppercase">VEO ACTIVE STAGE</span>
              </div>
              {activeGeneration && (
                <span className="text-[9px] bg-white/5 text-orange-400 font-mono font-bold px-2 py-0.5 border border-white/10 uppercase tracking-widest">
                  {activeGeneration.aspectRatio} | {activeGeneration.resolution}
                </span>
              )}
            </div>

            {/* Screen Sandbox */}
            <div className="w-full bg-black rounded-none border border-white/10 flex items-center justify-center overflow-hidden aspect-video relative group shadow-inner">
              
              <AnimatePresence mode="wait">
                {/* IDLE / EMPTY STATE */}
                {status === "idle" && !activeGeneration && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center p-6 space-y-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-lg">
                      <Video className="w-7 h-7 text-white/40" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-widest text-white">THEATER STANDBY</h3>
                      <p className="text-[11px] text-white/40 max-w-sm mt-1.5 leading-relaxed uppercase">
                        Select a film preset, configure parameters, or upload an image to project your synthesis.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* GENERATING / LOADING STATE */}
                {(status === "generating" || status === "polling") && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#050505]/95 flex flex-col items-center justify-center p-8 text-center space-y-6"
                  >
                    {/* Clapperboard Animation */}
                    <motion.div
                      animate={{
                        scale: [1, 1.03, 1],
                      }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-24 h-24 bg-white/5 border border-white/10 rounded-none flex flex-col justify-between overflow-hidden shadow-2xl relative"
                    >
                      {/* Top bar of clapperboard */}
                      <div className="h-6 bg-black flex border-b border-white/10">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className={`flex-1 h-full skew-x-[30deg] ${
                              i % 2 === 0 ? "bg-white" : "bg-transparent"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="p-2 flex flex-col items-center justify-center flex-1">
                        <span className="text-[9px] font-mono font-bold tracking-widest text-orange-500 animate-pulse">
                          SCENE_01
                        </span>
                        <span className="text-[8px] font-mono text-white/50 uppercase mt-0.5">
                          TAKE {isExtending ? "EXT" : "INIT"}
                        </span>
                      </div>
                    </motion.div>

                    <div className="space-y-2 max-w-sm">
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                        <span>SYNTHESIZING FRAME VECTORS</span>
                      </div>
                      
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={activeMessageIndex}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="text-[11px] text-orange-400 font-bold tracking-wider uppercase h-4"
                        >
                          {REASSURING_MESSAGES[activeMessageIndex]}
                        </motion.p>
                      </AnimatePresence>

                      <p className="text-[9px] text-white/30 leading-relaxed pt-2 uppercase tracking-wide">
                        Rendering high fidelity 3D temporal matrices. Please hold for transmission.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* ERROR STATE */}
                {status === "error" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-6 text-center space-y-4 max-w-sm"
                  >
                    <div className="w-12 h-12 rounded-full bg-orange-950/20 border border-orange-500/20 flex items-center justify-center mx-auto text-orange-500">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest text-white">SYNTHESIS FAILURE</h4>
                      <p className="text-[11px] text-white/50 leading-relaxed mt-2 uppercase font-mono">
                        {generationError || "Upstream spatial generation timed out or failed."}
                      </p>
                    </div>
                    <button
                      onClick={() => setStatus("idle")}
                      className="px-6 py-2 border border-white/25 hover:border-orange-500 hover:text-orange-400 text-[10px] font-bold tracking-widest uppercase transition-colors rounded-none text-white"
                    >
                      BACK TO DESK
                    </button>
                  </motion.div>
                )}

                {/* ACTIVE PLAYABLE VIDEO */}
                {status === "done" && activeGeneration && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 w-full h-full"
                  >
                    {/* The player glow */}
                    <div className="absolute inset-0 pointer-events-none drop-shadow-[0_0_80px_rgba(249,115,22,0.15)]" />
                    
                    <video
                      ref={videoRef}
                      src={`${activeGeneration.videoUrl}?op=${encodeURIComponent(activeGeneration.operationName)}`}
                      className="w-full h-full object-contain"
                      loop
                      playsInline
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onClick={handlePlayPause}
                    />

                    {/* Hover controls HUD */}
                    <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handlePlayPause}
                          className="p-2.5 bg-orange-500 text-black hover:bg-orange-600 rounded-none transition shadow-lg"
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                        </button>
                        <button
                          onClick={handleToggleMute}
                          className="p-2.5 bg-white/10 hover:bg-white/20 rounded-none border border-white/15 transition"
                        >
                          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-white/75" /> : <Volume2 className="w-3.5 h-3.5 text-white/75" />}
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleVideoDownload(activeGeneration)}
                          className="p-2.5 bg-white/10 hover:bg-white/20 rounded-none border border-white/15 transition text-white/75 hover:text-white"
                          title="Download raw video"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleFullscreen}
                          className="p-2.5 bg-white/10 hover:bg-white/20 rounded-none border border-white/15 transition text-white/75 hover:text-white"
                        >
                          <Maximize className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* Cinematic Details & Extender block */}
            {activeGeneration && status === "done" && (
              <div className="w-full mt-6 space-y-6">
                
                {/* Active movie details info */}
                <div className="p-5 bg-white/[0.01] rounded-none border-l-2 border-l-orange-500 border-y border-r border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-mono tracking-[0.3em] text-orange-500 uppercase font-black">
                      ACTIVE FOOTAGE
                    </span>
                    <h3 className="font-black text-sm text-white mt-1 uppercase tracking-tight truncate">
                      {activeGeneration.prompt.split(" ").slice(0, 5).join(" ") || "Custom Generation"}...
                    </h3>
                    <p className="text-xs text-white/60 leading-relaxed mt-1 italic">
                      &ldquo;{activeGeneration.prompt}&rdquo;
                    </p>
                  </div>

                  <button
                    onClick={() => handleVideoDownload(activeGeneration)}
                    className="bg-white hover:bg-orange-500 text-black hover:text-white text-[10px] tracking-widest font-black py-2.5 px-5 rounded-none flex items-center justify-center gap-2 transition shrink-0 self-start md:self-center uppercase"
                  >
                    <Download className="w-4 h-4" />
                    <span>DOWNLOAD FILE</span>
                  </button>
                </div>

                {/* 7-Second Extender block */}
                <div className="bg-white/[0.02] border border-white/15 rounded-none p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-orange-500" />
                    <span className="text-[10px] font-black tracking-widest uppercase text-white">EXTEND TEMPORAL TIMELINE (+7 SECONDS)</span>
                  </div>
                  
                  <form onSubmit={handleExtendGeneration} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={extensionPrompt}
                      onChange={(e) => setExtensionPrompt(e.target.value)}
                      placeholder="e.g. A slow dolly zoom backward as the dust particles glow intensely"
                      className="flex-1 bg-black/60 border border-white/15 focus:border-orange-500 focus:outline-none rounded-none px-4 py-3 text-xs text-white placeholder-white/25 transition-all font-mono"
                    />
                    <button
                      type="submit"
                      disabled={!extensionPrompt}
                      className="bg-orange-500 hover:bg-orange-600 disabled:bg-white/5 disabled:text-white/20 text-white font-black px-6 py-3 rounded-none text-[10px] tracking-widest uppercase transition-colors shrink-0 cursor-pointer"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>APPEND SCENE</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  </form>
                </div>

              </div>
            )}

          </section>

          {/* HISTORIC MOVIE LIBRARY */}
          <section id="movie-library" className="bg-white/[0.02] border border-white/10 rounded-none p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-500" />
                <h3 className="font-black text-white tracking-[0.2em] uppercase text-xs">CINEMATIC ARCHIVES</h3>
              </div>
              <span className="text-[9px] text-white/40 font-mono tracking-widest uppercase font-bold">
                {movieLibrary.length} REEL CLIPS
              </span>
            </div>

            {movieLibrary.length === 0 ? (
              <div className="text-center py-10 text-white/30">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-[10px] font-bold tracking-widest uppercase">ARCHIVES VACANT</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-1">
                {movieLibrary.map((clip, index) => (
                  <div
                    key={clip.id}
                    onClick={() => {
                      setActiveGeneration(clip);
                      setStatus("done");
                    }}
                    className={`p-4 rounded-none border text-left transition-all duration-200 flex items-start gap-4 cursor-pointer relative group ${
                      activeGeneration?.id === clip.id
                        ? "border-orange-500 bg-orange-500/[0.02]"
                        : "border-white/10 bg-white/[0.01] hover:border-white/30 hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* Thumbnail representation */}
                    <div className="w-14 h-14 bg-black border border-white/15 rounded-none flex items-center justify-center shrink-0 overflow-hidden relative">
                      {clip.baseImagePreview ? (
                        <img
                          src={clip.baseImagePreview}
                          alt="Base Frame"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="w-5 h-5 text-white/30" />
                      )}
                      {clip.isExtension && (
                        <div className="absolute top-0 right-0 bg-orange-500 text-black text-[7px] font-black px-1 py-0.5 uppercase">
                          EXT
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[8px] text-white/40 font-mono tracking-widest font-bold uppercase">
                          SCENE {String(movieLibrary.length - index).padStart(2, '0')}
                        </span>
                        <button
                          onClick={(e) => deleteFromLibrary(clip.id, e)}
                          className="text-white/40 hover:text-orange-500 p-0.5 transition-colors"
                          title="Purge clip"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      <p className="text-xs font-black text-white uppercase tracking-tight truncate mt-1 group-hover:text-orange-400 transition-colors">
                        {clip.prompt.split(" ").slice(0, 3).join(" ")}
                      </p>
                      
                      <p className="text-[10px] text-white/50 truncate mt-0.5 font-mono">
                        {clip.prompt}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

      </main>

      {/* Cinematic Studio Footer */}
      <footer className="p-10 flex flex-col sm:flex-row justify-between items-center sm:items-end border-t border-white/10 bg-black/40 relative z-10 gap-6 sm:gap-0 mt-12">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <span className="text-[9px] uppercase tracking-[0.3em] opacity-40 font-bold">Soundscape Engine by</span>
          <span className="text-xs font-semibold italic text-white">VEO Spatial Audio Labs</span>
        </div>
        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
          <div className="w-1.5 h-1.5 bg-white/20 rounded-full"></div>
        </div>
        <div className="text-right">
          <span className="text-[36px] leading-none font-black opacity-10 tracking-tighter text-white uppercase">2026</span>
        </div>
      </footer>
    </div>
  );
}

