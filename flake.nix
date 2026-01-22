{
  description = "Cinephage - A media management application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      perSystem =
        {
          config,
          self',
          inputs',
          pkgs,
          system,
          ...
        }:
        {
          packages = {
            default = self'.packages.cinephage;
            cinephage = pkgs.callPackage ./nix/package.nix { };
          };

          devShells = {
            default = pkgs.mkShell {
              packages = with pkgs; [
                nodejs
                ffmpeg
              ];
            };
          };
        };
    };
}
