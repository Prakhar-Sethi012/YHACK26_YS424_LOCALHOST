import json
import numpy as np
try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Run pip install Pillow to use this script.")
    exit(1)

def main():
    try:
        elev_img = Image.open("wayanad_elevation.png").convert("L").resize((100, 100))
        elev_arr = (np.array(elev_img, dtype=np.float32) / 255.0) * 40.0 # Scale 0-40m
        
        obs_img = Image.open("wayanad_obstacles.png").convert("L").resize((100, 100))
        obs_bool = (np.array(obs_img) < 128).tolist() # Black pixels (<128) are impassable
        
        with open("terrain_data.json", "w") as f:
            json.dump({"elevation": elev_arr.tolist(), "obstacles": obs_bool}, f)
            
        print("Success! terrain_data.json generated. Restart the backend to apply.")
    except Exception as e:
        print(f"Error parsing maps: {e}\nPlease ensure wayanad_elevation.png and wayanad_obstacles.png exist.")

if __name__ == "__main__":
    main()
