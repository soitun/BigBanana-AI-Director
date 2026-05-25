# BigBanana AI Director

> **AI-Powered End-to-End Short Drama & Motion Comic Platform**

[![中文](https://img.shields.io/badge/Language-中文-gray.svg)](./README.md)
[![English](https://img.shields.io/badge/Language-English-blue.svg)](./README_EN.md)
[![日本語](https://img.shields.io/badge/Language-日本語-gray.svg)](./README_JA.md)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**BigBanana AI Director** is an **AI-powered, one-stop platform** for **short dramas** and **motion comics**, built for creators who want to go from idea to final video fast.

Moving away from the traditional "slot machine" style of random generation, BigBanana adopts an industrial **"Script-to-Asset-to-Keyframe"** workflow. With deep integration of AntSK API’s advanced AI models, it enables **one-sentence to complete drama** — fully automated from **script** to **final video**, while maintaining precise control over character consistency, scene continuity, and camera movement.

## Release Policy

Due to repeated plagiarism, reposting without attribution, and several severe abuse cases, future updates will be delivered only through official Docker images and will no longer be published as updated public source code.

This repository remains available as public documentation and a historical reference snapshot. For deployment and upgrades, use `docker-compose.yaml` with the official images.
We still provide full source code delivery for commercial edition customers.

## UI Showcase

### Project Management
![Project Management](./images/项目管理.png)

### Project Overview & Novel Import
![Full Novel Import](./images/导入整篇小说.png)

### Worldview Building
![Worldview Building](./images/世界观.png)

### Phase 01: Narrative Planning
![Script Creation](./images/剧本创作.png)
![Script & Story](./images/剧本与故事.png)

### Phase 02: Consistency Assets
![Character & Scene](./images/角色场景.png)
![Scenes](./images/场景.png)
![Props](./images/道具.png)

### Phase 03: Shot Production
![Director Workbench](./images/导演工作台.png)
![Nine-Grid Storyboard](./images/镜头九宫格.png)
![Shots & Frames](./images/镜头与帧.png)
![Shots & Frames Detail](./images/镜头与帧1.png)

### Phase 04: Delivery Center
![CutOS Rough Cut](./images/CutOs剪辑.png)
![Delivery Center](./images/成片导出.png)

### Prompt Management
![Prompt Management](./images/提示词管理.png)
## Core Philosophy: Keyframe-Driven

Traditional Text-to-Video models often struggle with specific camera movements and precise start/end states. BigBanana introduces the animation concept of **Keyframes**:

1.  **Draw First, Move Later**: First, generate precise Start and End frames.
2.  **Interpolation**: Use the Veo model to generate smooth video transitions between these two frames.
3.  **Asset Constraint**: All visual generation is strictly constrained by "Character Sheets" and "Scene Concepts" to prevent hallucinations or inconsistencies.

## Key Features

### Project-Level Workflow
*   **Project Hub**: Manage recent projects, account access, model settings, the global asset library, and full-library import/export from one place.
*   **Project Overview**: Organize content by `Project -> Season -> Episode`, import a full novel and split it into episode drafts automatically, and export full-project backups.
*   **Project Resources & Worldview**: Build reusable characters, scenes, props, maps, regions, locations, and music/worldbuilding anchors before episode production. These constraints feed back into later script, asset, and shot generation.

### Phase 01: Narrative Planning
*   **Structured Script Generation**: Start from a story outline, novel excerpt, or episode idea, and let the AI generate structured characters, scenes, props, and shots.
*   **Configuration-Driven Output**: Set language, target duration, visual style, and model stack up front to keep the whole pipeline aligned.
*   **AI Continuation + Manual Refinement**: Continue, rewrite, and manually edit script body text, character descriptions, shot actions, dialogue, and prompts.
*   **Auto-Production Planning Preview**: Before batch generation starts, review an AI-generated plan and decide shot by shot whether to use the nine-grid storyboard route or the keyframe route.

### Phase 02: Consistency Assets
*   **Character Consistency Sheets**: Generate reference images for each character and maintain multiple looks through the wardrobe system without losing identity.
*   **Scene / Prop Assetization**: Build reusable scene assets and independent prop prompts, references, and shape references.
*   **Asset Library Reuse**: Reuse characters, scenes, and props from project resources or the cross-project asset library.
*   **Batch Asset Completion**: Fill missing character, scene, and prop images in one pass before moving into shot production.

### Phase 03: Shot Production
*   **Grid-Based Shot Workbench**: Manage all shots in a panoramic workspace with scene, character, prop, and action context visible per shot.
*   **Keyframe Precision Control**: Generate, upload, inherit, and edit Start Frames and End Frames for tighter shot-state control.
*   **Nine-Grid Storyboard Preview**: Generate 9 candidate viewpoints first, then use the whole grid or a cropped panel as the final start frame.
*   **Context-Aware Generation**: Shot generation automatically reads the current scene image, outfit references, and prop references to reduce continuity breaks.
*   **Dual Video Routes**: Supports both single-image Image-to-Video and Start/End keyframe interpolation.

### Phase 04: Delivery Center
*   **Timeline Preview & Render Tracking**: Inspect completion progress, rough-cut timelines, and render logs in real time.
*   **CutOS-Style AI Rough Cut**: Use the built-in timeline editor to reorder, trim, filter, and inspect generated shots before export.
*   **Multiple Delivery Formats**: Export master videos, zipped shot segments, and source assets for downstream work in Premiere, Resolve, and other NLEs.
*   **Episode-Level Backup**: Import/export the current episode data for cross-device migration and collaboration.

### Phase 05: Prompt Management
*   **Centralized Search & Editing**: Review and edit templates, character prompts, scene prompts, prop prompts, keyframe prompts, and video prompts in one place.
*   **Version Rollback**: Keep prompt edit history and restore earlier prompt versions quickly.
*   **Cross-Stage Debugging**: When results become unstable, use this page to trace and fix upstream prompt issues directly.

## Public Release Format

*   **Delivery**: This public repository mainly provides documentation, `docker-compose.yaml`, and the deployment entry for official Docker images. Ongoing source updates are not synced here.
*   **Runtime**: Start the full workbench through the official Docker images and use it directly in the browser, without building the frontend or assembling the runtime manually.
*   **Model Access**: The default workflow uses AntSK API for unified text, image, and video model access.
*   **Data Storage**: Project data is primarily stored in the local browser environment, and version upgrades are delivered through official images.

## Why Choose AntSK API?

This project deeply integrates [**AntSK API Platform**](https://api.antsk.cn/), delivering exceptional value for creators:

### 🎯 Full Model Coverage
* **Text Models**: GPT-5.2, GPT-5.1, Claude 4.6 Sonnet
* **Vision Models**: Nano Banana Pro, Gpt Image 2
* **Video Models**: Sora-2, Veo-3.1, Vidu, Seedance 2.0, happyhorse, and more
* **Unified Access**: Single API for all models, no platform switching

### 💰 Unbeatable Pricing
* **Under 20% of Official Prices**: Save 80%+ on all models
* **Pay-As-You-Go**: No minimum spend, pay only for what you use
* **Enterprise-Grade Reliability**: 99.9% SLA, 24/7 technical support

### 🚀 Developer-Friendly
* **OpenAI-Compatible**: Zero migration cost for existing code
* **Comprehensive Docs**: Full API documentation and code examples
* **Real-Time Monitoring**: Visual usage stats and cost tracking

[**Sign Up for Free Credits**](https://api.antsk.cn/) →

## ⚠️ Source Availability & “Free” Clarification (Please Read)

* **How future updates are delivered**: Because of repeated plagiarism, unattributed reposting, and malicious misuse, future feature updates will be distributed only through official Docker images and will no longer be synced as public source code.
* **What this repository is now**: This public repository remains as documentation, `docker-compose.yaml`, and a historical reference. For deployment and upgrades, follow the official Docker image release path.
* **Commercial edition source access**: We still provide full source code delivery to commercial edition customers. If you need commercial cooperation or licensing, please use the contact information at the end of this document.
* **Model usage note**: The publicly runnable release uses the workflow preconfigured in the official Docker images and still requires a capability-matched model stack, for example an LLM (such as **GPT-5.2**), an image model (such as **Nano Banana Pro**), and a video model (such as **Sora-2** / **Veo-3.1**). If you need other providers, a private model gateway, or deeper customization, that should be handled on top of the commercial source delivery.
* **About our API service**: The API we provide is mainly for quick experience and integration, not as a core profit source.
* **Freedom of choice**: If our API does not meet your expectations, you can absolutely use official OpenAI or Google services directly (even at a higher price). That is a normal and respected choice.
* **About “always free” expectations**: If your primary criterion is long-term “must be free,” this project may not be the best fit for you.

---

## 💬 Join Our Community

Scan the QR code to join our **BigBanana Product Experience Group** on WeChat. Connect with fellow creators, share tips, and get the latest updates:

<div align="center">
<img src="./images/qrcode.jpg" width="300" alt="WeChat Group QR Code">
<p><i>Scan to join WeChat group</i></p>
</div>

---

### 🎨 Lightweight Creation Tools

For **quick one-off creative tasks**, try our online tool platform:

**[BigBanana Creation Studio](https://bigbanana.tree456.com/)** offers:
* 📷 **[AI Image Generation](https://bigbanana.tree456.com/gemini-image.html)**: Text-to-image with multiple styles
* 📊 **[AI PowerPoint](https://bigbanana.tree456.com/ppt-content.html)**: Generate presentations instantly
* 🎬 **[AI Video](https://bigbanana.tree456.com/ai-video-content.html)**: Intelligent video content generation
* 📱 **[Social Media Content](https://bigbanana.tree456.com/redink-content.html)**: Viral titles and posts for Xiaohongshu
* 📖 **[AI Novel Creation](https://bigbanana.tree456.com/novel-creation.html)**: Intelligent novel generation and continuation
* 🎨 **[AI Anime Generation](https://bigbanana.tree456.com/anime-content.html)**: Anime-style image creation
* 🎭 **No Installation**: Use directly in browser, instant access

**Best For**: Daily creation, rapid prototyping, idea validation  
**This Project Is For**: Systematic drama production, batch video generation, industrial workflows

## Online Version

No client download is required. Use the web version directly in your browser:

**🌐 Open BigBanana AI Director Online**

[https://director.tree456.com/](https://director.tree456.com/)

> 💡 Open the online version in your browser and start using it immediately, with no installation and always up-to-date access.

---

## Deployment

### Docker Image Deployment (Public Release)

```bash
# 1. Get the deployment files
git clone https://github.com/shuyu-labs/BigBanana-AI-Director.git
cd BigBanana-AI-Director

# 2. Start the official images
# Docker Compose will automatically pull and start the required official images on first start
docker-compose up -d

# 3. Open in browser
# Visit http://localhost:3005

# View logs
docker-compose logs -f

# Stop the services
docker-compose down
```

### Update official images

```bash
# Pull the latest official images and recreate containers
docker-compose pull
docker-compose up -d --force-recreate
```

---

## Quick Start

1.  **Set up account / keys**: On first launch, add your AntSK API Key or Token through onboarding, Account Center, or Model Settings. [**Buy API Key**](https://api.antsk.cn)
2.  **Create a project**: Start from the Project Hub so seasons, episodes, reusable assets, and delivery outputs all stay organized under one project.
3.  **Build the project structure**: In Project Overview, create seasons/episodes manually or import a full novel and let the system split it into multiple episode drafts.
4.  **Prepare reusable resources**: Add project-level characters, scenes, props, and worldview anchors first if you want stronger consistency across episodes.
5.  **Enter Phase 01: Narrative Planning**: Generate the structured script, then review and refine characters, actions, dialogue, and prompts. If you want batch production, review the auto-production plan first.
6.  **Move into Phase 02 / 03**: Complete consistency assets, then generate start frames, end frames, nine-grid boards, and video clips in Shot Production.
7.  **Finish in Phase 04 / 05**: Preview, rough-cut, export, and back up in the Delivery Center; if output quality needs tuning, return to Prompt Management for centralized prompt fixes.

---

## Project Inspiration

Some of this project's product ideas and workflow design were inspired by the publicly available content of [CineGen-AI](https://github.com/Will-Water/CineGen-AI) at commit `6505c9076f8d72df837e5062b8df1d90319a4e83`.

This note is only intended to identify the inspiration source and does not imply ongoing code synchronization with later versions of that project or any commercial authorization relationship.

Thanks to the original author for openly sharing their work and inspiration.

---

## License

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

- ✅ Personal learning and non-commercial use allowed
- ✅ Modification and derivative works allowed (under the same license)
- ❌ Commercial use prohibited (requires commercial license)

For commercial licensing, please contact: antskpro@qq.com

---
*Built for Creators, by BigBanana.*
