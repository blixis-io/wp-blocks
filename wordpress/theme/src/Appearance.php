<?php
/**
 * Site-wide website appearance preference (BWB-108).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/** Website appearance is independent of the editor interface preference. */
final class Appearance {
	public const OPTION = 'blixis_appearance';

	/** Minified source: assets/js/appearance-init.js. */
	public const INITIALIZER = '(function(){try{const value=localStorage.getItem(\'blixis-appearance\');if(value===\'light\'||value===\'dark\'){document.documentElement.setAttribute(\'data-theme\',value);document.querySelector(\'meta[name="color-scheme"]\').setAttribute(\'content\',value);}}catch{}})();';

	/** CSP script-src hash for the exact inline initializer text. */
	public static function init_script_csp_hash(): string {
		return 'sha256-' . \base64_encode( \hash( 'sha256', self::INITIALIZER, true ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- CSP requires a base64 digest.
	}

	/**
	 * Normalize absent or invalid option data to the system-following default.
	 *
	 * @param mixed $value Option value.
	 */
	public static function normalize( mixed $value ): string {
		return \in_array( $value, [ 'auto', 'light', 'dark' ], true ) ? $value : 'auto';
	}

	/** Read the site's default website appearance. */
	public static function site_mode(): string {
		return self::normalize( get_option( self::OPTION, false ) );
	}

	/**
	 * Add a forced mode to the html attributes only when no other source set one.
	 *
	 * @param string $attributes Existing html attributes.
	 * @param string $mode       Site mode.
	 */
	public static function html_attributes( string $attributes, string $mode ): string {
		$mode = self::normalize( $mode );
		if ( 'auto' === $mode || 1 === \preg_match( '/(?:^|\s)data-theme\s*=/i', $attributes ) ) {
			return $attributes;
		}
		return $attributes . ' data-theme="' . $mode . '"';
	}

	/**
	 * The native color scheme advertised in the document head.
	 *
	 * @param string $mode Site mode.
	 */
	public static function meta_content( string $mode ): string {
		$mode = self::normalize( $mode );
		return 'auto' === $mode ? 'light dark' : $mode;
	}

	/**
	 * WordPress language_attributes filter.
	 *
	 * @param string $attributes Existing html attributes.
	 */
	public static function filter_language_attributes( string $attributes ): string {
		if ( is_admin() ) {
			return $attributes;
		}
		return self::html_attributes( $attributes, self::site_mode() );
	}

	/** WordPress wp_head action. */
	public static function print_meta(): void {
		$mode = self::site_mode();
		echo '<meta name="color-scheme" content="' . esc_attr( self::meta_content( $mode ) ) . "\">\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- The dynamic attribute is escaped.
		if ( 'auto' === $mode ) {
			echo wp_get_inline_script_tag( self::INITIALIZER ) . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core applies script attribute filters.
		}
	}
}
