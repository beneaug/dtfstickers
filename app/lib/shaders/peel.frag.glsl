uniform sampler2D uMap;
uniform float uPeel;
uniform float uPeelAngle;
uniform float uCylinderRadius;
uniform vec3 uLightPos;
uniform float uTime;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormal;
varying float vPeelFactor;
varying float vIsBacking;
varying float vAO;
varying vec3 vWorldPos;

#define PI 3.14159265359

// Simple hash for procedural paper grain noise
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 lightDir = normalize(uLightPos - vWorldPos);
  vec3 halfVec = normalize(lightDir + viewDir);

  // Fresnel-Schlick approximation (dielectric F0 = 0.04)
  float cosTheta = max(0.0, dot(normal, viewDir));
  float F0 = 0.04;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

  // Specular highlight
  float specAngle = max(0.0, dot(normal, halfVec));
  float specular = pow(specAngle, 28.0);

  // Diffuse lighting
  float diffuse = max(0.0, dot(normal, lightDir)) * 0.3 + 0.7; // mostly ambient

  vec4 color;

  if (vIsBacking > 0.5) {
    // --- Back face: paper backing ---
    vec3 paperColor = vec3(0.961, 0.949, 0.922); // #f5f2eb

    // Procedural paper grain
    float grain = hash(vUv * 200.0) * 0.04 - 0.02;
    paperColor += grain;

    // Matte material — low specular, low fresnel
    float paperDiffuse = max(0.0, dot(normal, lightDir)) * 0.25 + 0.75;
    paperColor *= paperDiffuse;

    // Ambient occlusion near fold
    paperColor *= (1.0 - vAO * 0.5);

    color = vec4(paperColor, uOpacity);
  } else {
    // --- Front face: vinyl sticker ---
    vec4 texColor = texture2D(uMap, vUv);

    vec3 lit = texColor.rgb * diffuse;

    // Vinyl glossy sheen
    lit += specular * 0.35;
    lit += fresnel * 0.08;

    // Ambient occlusion near fold line
    lit *= (1.0 - vAO);

    color = vec4(lit, texColor.a * uOpacity);
  }

  // --- Fold-line shadow ---
  // Cast shadow on the flat sticker surface near the fold
  float foldShadow = 0.0;
  if (vPeelFactor < 0.01 && uPeel > 0.02) {
    // For vertices near the fold line on the flat part
    // Compute approximate distance from fold
    float shadowD = (1.0 - vPeelFactor) * 0.1;
    foldShadow = 0.35 * exp(-shadowD * shadowD / 32.0);
  }
  color.rgb *= (1.0 - foldShadow);

  gl_FragColor = color;
}
