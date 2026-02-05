# Smart Channel Swapper (SCS)

A Photoshop UXP plugin for advanced channel mixing and color transformation. Create complex color swaps easily, locally.

<img width="1920" height="1080" alt="Screenshot (4)" src="https://github.com/user-attachments/assets/eb7a8780-6837-4afc-8a42-b5e52c7401a4" />

The photo has been copied and layer-mask added manually to show a before -> after comparison in one image.

## Features
- Create and manage color pairs for transformation
- Compute optimal channel mixing matrix
- Apply results directly to Photoshop Channel Mixer
- Prevent clipping, if desired

## Installation

### 1. Download the Plugin
- Download the latest `.ccx` release from [Releases]([https://github.com/CheeseCube312/CCubes-Smart-Channel-Swapper/releases/tag/V1.0.2]).

### 2. Install in Photoshop
- Open the Creative Cloud Desktop app
- Go to **Plugins > Manage Plugins > Install from file**
- Select the downloaded `SmartChannelSwapper_PS.ccx` file
- Alternatively, double-click the `.ccx` file to install

### 3. Launch the Plugin
- Open Photoshop
- Go to **Plugins > Smart Channel Swapper**

## Usage
1. Add color pairs (source and target colors)
2. Click **Apply** to compute and apply the channel mixing
3. View results and tweak settings as needed

## How It Works

### The Problem
Photoshop's Channel Mixer transforms colors by mixing the Red, Green, and Blue channels with adjustable percentages. Because achieving specific goals with that is hard most Channel Mixes are simple channel swaps. 

### Unlocking more complex Mixes
This plugin lets you choose a Starting point and a target, using **least squares optimization** to automatically calculate the best Channel Mixer settings to get there. The ease of use makes more complex Channel Mixes viable, not just a matter of experimentation. 

### The Math (Simplified)
Photoshop's Channel Mixer uses a simple equation:

```
input color × matrix = output color
```

**Normal usage (manual sliders):**
- You have the input (image pixels)
- You set the matrix (slider values)
- Photoshop calculates the output (transformed pixels)

**What this plugin does:**
- You provide input AND output (your source → target color pairs)
- The plugin solves for the matrix (the slider values that make input → output work)
- Photoshop then applies that matrix to the actual image

Same equation—just solving for a different unknown. You give both ends (before and after colors), and the plugin figures out the middle part (the mixer settings) using least squares optimization.

### Why Use Multiple Pairs?
- **One pair** gives an exact transformation for that color, but may distort other colors unpredictably.
- **Multiple pairs (2–4)** constrain the solution, finding a better compromise that transforms your target colors while minimizing damage to the rest of the image.

### Global Optimum
Because this is a linear least squares problem, the solution is always the mathematically best possible fit—there are no "local traps" or suboptimal results.

## That being said
Your results are only as good as your source and your target. Some changes mess a lot with other parts of the image, others don't. So experiment. Adjust the colors a little. Add a few more targets, remove a weird one. Experimentation is fast with this tool and it's non-destructive.  

## License
MIT License

(C) 2026 Josef Brockamp (IG @workinprogress.photo)



