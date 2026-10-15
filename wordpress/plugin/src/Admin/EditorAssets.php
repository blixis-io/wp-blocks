<?php
/**
 * Editor bundle manifest validation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

\defined( 'ABSPATH' ) || exit;

/** Validates bundle metadata before constructing public asset URLs. */
final class EditorAssets {
	private const MAX_MANIFEST_BYTES = 4096;

	/**
	 * Read and validate a manifest file.
	 *
	 * @param string $manifest_path Absolute path to manifest.json.
	 * @param string $asset_base_url Public URL of the editor asset directory.
	 * @return ?array{js_url: string, css_url: string, version: string}
	 */
	public static function from_manifest( string $manifest_path, string $asset_base_url ): ?array {
		$size = \is_file( $manifest_path ) ? \filesize( $manifest_path ) : false;
		if ( ! \is_readable( $manifest_path ) || false === $size || $size > self::MAX_MANIFEST_BYTES ) {
			return null;
		}
		$raw = \file_get_contents( $manifest_path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin asset manifest.
		if ( ! \is_string( $raw ) || \strlen( $raw ) > self::MAX_MANIFEST_BYTES ) {
			return null;
		}
		$data = \json_decode( $raw, true );
		$keys = [ 'version', 'js', 'css', 'jsSha256', 'cssSha256' ];
		if ( ! \is_array( $data ) || [] !== \array_diff( \array_keys( $data ), $keys ) || [] !== \array_diff( $keys, \array_keys( $data ) ) || 1 !== ( $data['version'] ?? null ) || ! self::valid_name( $data['js'] ?? null, 'editor.js' ) || ! self::valid_name( $data['css'] ?? null, 'editor.css' ) || ! self::valid_hash( $data['jsSha256'] ?? null ) || ! self::valid_hash( $data['cssSha256'] ?? null ) || ! \is_file( \dirname( $manifest_path ) . '/editor.js' ) || ! \is_file( \dirname( $manifest_path ) . '/editor.css' ) ) {
			return null;
		}
		$base = \rtrim( $asset_base_url, '/' ) . '/';
		return [
			'js_url'  => $base . 'editor.js',
			'css_url' => $base . 'editor.css',
			'version' => $data['jsSha256'] . '.' . $data['cssSha256'],
		];
	}

	/**
	 * Ensure names are fixed contract filenames, rejecting traversal and extra files.
	 *
	 * @param mixed  $name Candidate filename.
	 * @param string $expected Fixed name.
	 * @return bool
	 */
	private static function valid_name( mixed $name, string $expected ): bool {
		return \is_string( $name ) && $name === $expected && 1 === \preg_match( '/^[a-z0-9.-]+$/D', $name );
	}

	/**
	 * Validate a SHA-256 digest.
	 *
	 * @param mixed $hash Candidate digest.
	 * @return bool
	 */
	private static function valid_hash( mixed $hash ): bool {
		return \is_string( $hash ) && 1 === \preg_match( '/^[a-f0-9]{64}$/D', $hash );
	}
}
