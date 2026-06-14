import wave
import struct
import math
import os

sample_rate = 44100

def get_mouse_click_samples(duration=0.06):
    num_samples = int(sample_rate * duration)
    samples = []
    seed = 101
    def rnd():
        nonlocal seed
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return (seed / 0x7fffffff) * 2.0 - 1.0

    for i in range(num_samples):
        t = i / sample_rate
        # Fast click transient
        envelope = math.exp(-t * 220)
        sine = math.sin(2 * math.pi * 2800 * t)
        noise = rnd()
        val = (sine * 0.7 + noise * 0.3) * envelope
        
        # Housing resonance
        body_env = math.exp(-t * 80)
        body = math.sin(2 * math.pi * 800 * t) * 0.15
        val += body * body_env
        
        samples.append(max(-1.0, min(1.0, val)))
    return samples

def get_key_tap_samples(duration=0.04):
    num_samples = int(sample_rate * duration)
    samples = []
    seed = 202
    def rnd():
        nonlocal seed
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return (seed / 0x7fffffff) * 2.0 - 1.0

    for i in range(num_samples):
        t = i / sample_rate
        # Softer keyboard transient (around 1200 Hz)
        envelope = math.exp(-t * 180)
        sine = math.sin(2 * math.pi * 1400 * t)
        noise = rnd()
        val = (sine * 0.6 + noise * 0.4) * envelope
        
        # Key release / echo
        release_env = math.exp(-t * 90)
        release = math.sin(2 * math.pi * 600 * t) * 0.1
        val += release * release_env
        
        samples.append(max(-1.0, min(1.0, val)))
    return samples

def write_wav(filepath, samples):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    wav_file = wave.open(filepath, 'w')
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(sample_rate)
    for s in samples:
        sample = int(s * 32767 * 0.8) # 80% volume peak
        wav_file.writeframesraw(struct.pack('<h', sample))
    wav_file.close()
    print(f"Written WAV: {filepath} ({len(samples)} samples)")

def generate_assets():
    # 1. Generate mouse click
    click_samples = get_mouse_click_samples()
    
    # 2. Generate keyboard typing sequence (2.5 seconds)
    typing_duration = 2.5
    total_samples = int(sample_rate * typing_duration)
    typing_samples = [0.0] * total_samples
    
    # Generate keyboard tap timings (around 16 taps per second, with random spacing)
    tap_spacing = 0.058 # 58ms spacing
    seed = 303
    def rnd():
        nonlocal seed
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / 0x7fffffff

    t = 0.05
    while t < typing_duration - 0.1:
        tap_samps = get_key_tap_samples()
        start_idx = int(sample_rate * t)
        for i, val in enumerate(tap_samps):
            if start_idx + i < total_samples:
                typing_samples[start_idx + i] += val
        # Add tap spacing with jitter
        t += tap_spacing + (rnd() - 0.5) * 0.02

    # Clip typing sequence
    for i in range(total_samples):
        typing_samples[i] = max(-1.0, min(1.0, typing_samples[i]))

    base_dir = "/Users/hanaaa/Projects/German language learning platform/antigravity/Vivid-Lingua/marketing"
    
    # Write files to both folders
    for project_dir in ["hyperframes-launch", "hyperframes-launch-916"]:
        write_wav(os.path.join(base_dir, project_dir, "assets/click.wav"), click_samples)
        write_wav(os.path.join(base_dir, project_dir, "assets/typing.wav"), typing_samples)

if __name__ == "__main__":
    generate_assets()
