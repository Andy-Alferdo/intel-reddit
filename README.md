<div align="center">

# 🕵️ Intel-Reddit

### **AI-Powered Reddit OSINT & Forensic Intelligence Platform**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-intel--reddit.vercel.app-blue?style=for-the-badge)](https://intel-reddit.vercel.app)
[![Model](https://img.shields.io/badge/🤗_AI_Model-Hugging_Face-yellow?style=for-the-badge)](https://huggingface.co/spaces/Takeda-Shingen/intel-reddit-analyzer)
[![Built With](https://img.shields.io/badge/Built_With-React_+_TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://reactjs.org)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)

<br />

> **Transform raw Reddit data into actionable intelligence.**  
> Intel-Reddit combines NLP-driven sentiment analysis, network graph forensics, and behavioral profiling to deliver a complete OSINT investigation suite — powered by a custom fine-tuned DistilBERT model.

<br />

</div>

---

## ⚡ Key Capabilities

<table>
<tr>
<td width="50%">

### 🧠 User Profiling & Behavioral Analysis
- **AI Sentiment Classification** — Every post & comment classified as Positive / Neutral / Negative using a custom DistilBERT model
- **Explainable AI (XAI)** — Gradient-based word-level saliency maps showing *why* the model made each prediction
- **Deep Analysis Mode** — One-click drill-down into any post/comment with word importance visualization
- **Location Intelligence** — spaCy NER extracts geographic indicators (GPE/LOC entities) from user content
- **Behavioral Patterns** — Identifies active communities, posting rhythms, and engagement patterns

</td>
<td width="50%">

### 🔗 Link & Network Analysis
- **Community Network Graphs** — Interactive force-directed graphs mapping user-to-subreddit connections
- **Cross-Community Detection** — Identifies users operating across multiple communities
- **Subreddit Relationship Mapping** — Visualize how subreddits are connected through shared user bases
- **Related Communities Discovery** — Automatically discover related subreddits through user overlap analysis

</td>
</tr>
<tr>
<td width="50%">

### 📊 Community Intelligence
- **Subreddit Deep Dive** — Analyze sentiment trends, hot topics, and community mood across any subreddit
- **Keyword Analysis Dashboard** — Real-time keyword tracking with sentiment distribution and trend detection
- **Unified Intelligence Feed** — Aggregated view of posts/comments with inline sentiment badges and XAI explanations
- **Treemap Visualization** — Visual representation of a user's top communities by activity volume

</td>
<td width="50%">

### 📋 Investigation & Reporting
- **Case Management** — Create, manage, and organize OSINT investigation cases
- **Saved Analysis History** — Persist analyzed profiles and communities for future reference
- **PDF/HTML Report Generation** — Export comprehensive intelligence reports with charts, sentiment breakdowns, and findings
- **Real-Time Monitoring** — Set up keyword and user monitoring alerts
- **Admin Dashboard** — Full administrative control with usage analytics

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  User     │ │ Community │ │  Link    │ │  Keyword         │  │
│  │ Profiling │ │ Analysis  │ │ Analysis │ │  Analysis        │  │
│  └─────┬────┘ └─────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│        │             │            │                 │            │
│        └─────────────┴────────────┴─────────────────┘            │
│                              │                                   │
├──────────────────────────────┼───────────────────────────────────┤
│              Supabase Edge Functions (Reddit API Proxy)          │
│                    reddit-scraper / OAuth2 PKCE                  │
├──────────────────────────────┼───────────────────────────────────┤
│          ┌───────────────────┴───────────────────────┐           │
│          │     Hugging Face Inference Space           │           │
│          │  ┌─────────────────────────────────────┐  │           │
│          │  │  DistilBERT (fine-tuned, 3-class)   │  │           │
│          │  │  + spaCy NER (location extraction)  │  │           │
│          │  │  + Gradient Saliency (XAI)          │  │           │
│          │  └─────────────────────────────────────┘  │           │
│          └───────────────────────────────────────────┘           │
├──────────────────────────────────────────────────────────────────┤
│                   Supabase (PostgreSQL + Auth + Storage)          │
│     Cases │ Profiles │ Analyses │ Reddit Content │ Monitoring    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧪 AI Model Details

| Component | Details |
|-----------|---------|
| **Base Model** | `DistilBERT` (6 layers, 768 dim) fine-tuned for sequence classification |
| **Classes** | `negative` · `neutral` · `positive` |
| **Tokenizer** | `BertTokenizerFast` with 512 max length |
| **XAI Method** | Gradient × Embedding saliency (single backward pass) |
| **Location Extraction** | spaCy `en_core_web_sm` — GPE/LOC entity recognition |
| **Deployment** | Hugging Face Spaces (Gradio, CPU) |
| **Endpoints** | `/analyze_reddit_content` · `/analyze_sentiment` · `/deep_analyze` · `/predict` |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- A [Supabase](https://supabase.com) project
- Reddit API credentials (for the Edge Function scraper)

### Installation

```bash
# Clone the repository
git clone https://github.com/Andy-Alferdo/intel-reddit.git
cd intel-reddit

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

### Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
VITE_HF_SPACE_URL=https://takeda-shingen-intel-reddit-analyzer.hf.space
```

### Development

```bash
npm run dev
```

The app will be running at [localhost:8080](http://localhost:8080).

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI** | shadcn/ui, Tailwind CSS, Recharts, Lucide Icons |
| **Backend** | Supabase (PostgreSQL, Edge Functions, Auth, RLS) |
| **AI/ML** | DistilBERT (PyTorch), spaCy, Gradio |
| **Data** | Reddit API (OAuth2), Supabase Edge Functions |
| **Visualizations** | Force-directed graphs, Treemaps, Donut charts, Word clouds, Sparklines |
| **Deployment** | Vercel (frontend), Hugging Face Spaces (AI model) |

---

## 📁 Project Structure

```
intel-reddit/
├── src/
│   ├── pages/               # Main application pages
│   │   ├── UserProfiling     # Reddit user behavioral analysis
│   │   ├── Analysis          # Community sentiment analysis
│   │   ├── LinkAnalysis      # Network graph forensics
│   │   ├── CommunityAnalysis # Subreddit deep dive
│   │   ├── Monitoring        # Real-time alert system
│   │   ├── Dashboard         # Investigation hub
│   │   └── Report            # Intelligence report generation
│   ├── components/           # Reusable UI components
│   │   ├── keyword-analysis/ # Keyword tracking dashboard
│   │   ├── monitoring/       # Alert monitoring widgets
│   │   └── ui/               # shadcn/ui primitives
│   ├── integrations/
│   │   └── huggingface/      # Gradio client for AI model
│   ├── contexts/             # React context (auth, cases, investigation)
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Report generator, utilities
│   └── utils/                # Helper functions
├── supabase/
│   └── functions/            # Edge Functions (reddit-scraper)
└── public/                   # Static assets
```

---

## 📜 License

This project is developed as a Final Year Project (FYP) for academic purposes.

---

<div align="center">
  <sub>Built with ☕ and curiosity — Intel-Reddit © 2026</sub>
</div>
