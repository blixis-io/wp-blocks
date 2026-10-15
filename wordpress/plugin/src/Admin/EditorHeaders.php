<?php
/**
 * Isolated editor response headers.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

\defined( 'ABSPATH' ) || exit;

/** Pure response header contract for the editor document. */
final class EditorHeaders {
	/**
	 * Canvas document headers.
	 *
	 * @param string $csp_nonce Per-response nonce.
	 * @return array<string, string>
	 * @throws \InvalidArgumentException When the nonce is malformed.
	 */
	public static function canvas_list( string $csp_nonce ): array {
		if ( ! self::is_valid_nonce( $csp_nonce ) ) {
			throw new \InvalidArgumentException( 'Invalid CSP nonce.' );
		}
		return [
			'Content-Type'            => 'text/html; charset=UTF-8',
			'Cache-Control'           => 'private, no-store',
			'X-Content-Type-Options'  => 'nosniff',
			'Referrer-Policy'         => 'same-origin',
			'X-Frame-Options'         => 'SAMEORIGIN',
			'Content-Security-Policy' => "default-src 'none'; script-src 'nonce-" . $csp_nonce . "'; style-src 'self' 'nonce-" . $csp_nonce . "'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'",
		];
	}
	/**
	 * Required private response headers. The nonce lets the bundled UI libraries inject their own `<style>` elements (Radix
	 * dialogs lock scrolling that way) without `unsafe-inline`; it is generated per response.
	 *
	 * @param string $csp_nonce Per-response nonce from new_nonce().
	 * @return array<string, string>
	 * @throws \InvalidArgumentException When the nonce is malformed.
	 */
	public static function list( string $csp_nonce ): array {
		if ( ! self::is_valid_nonce( $csp_nonce ) ) {
			throw new \InvalidArgumentException( 'Invalid CSP nonce.' );
		}
		return [
			'Content-Type'            => 'text/html; charset=UTF-8',
			'Cache-Control'           => 'private, no-store',
			'X-Content-Type-Options'  => 'nosniff',
			'Referrer-Policy'         => 'same-origin',
			'X-Frame-Options'         => 'SAMEORIGIN',
			'Content-Security-Policy' => "default-src 'none'; script-src 'self'; style-src 'self' 'nonce-" . $csp_nonce . "'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
		];
	}

	/**
	 * A fresh unguessable nonce for one response (base64 of 18 random bytes).
	 *
	 * @return string
	 * @throws \Exception When no randomness is available.
	 */
	public static function new_nonce(): string {
		return \base64_encode( \random_bytes( 18 ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Encodes random bytes for a CSP nonce, not code.
	}

	/**
	 * Whether a value is acceptable as a CSP nonce (base64 or base64url characters, 16 to 64 long).
	 *
	 * @param string $nonce Candidate.
	 * @return bool
	 */
	public static function is_valid_nonce( string $nonce ): bool {
		return 1 === \preg_match( '/^[A-Za-z0-9+\/_=-]{16,64}$/D', $nonce );
	}
}
