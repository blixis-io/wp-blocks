<?php
/** Test-only WordPress stand-ins for visitor appearance. */
// phpcs:ignoreFile -- Isolated test stand-ins mirror WordPress function signatures.

namespace Blixis\Theme;
	if ( ! \defined( 'ABSPATH' ) ) {
		\define( 'ABSPATH', dirname( __DIR__ ) . '/' );
	}

	/** Test site option. */
	function get_option( string $name, mixed $default = false ): mixed {
		return $GLOBALS['blixis_test_mode'] ?? $default;
	}

	/** Test escaping. */
	function esc_attr( string $value ): string {
		return \htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
	}

	/** Test escaping. */
	function esc_html( string $value ): string {
		return esc_attr( $value );
	}

	/** Test translation. */
	function __( string $value, string $domain ): string {
		return $GLOBALS['blixis_test_translation'][ $value ] ?? $value;
	}

	/** Test translated attribute. */
	function esc_attr__( string $value, string $domain ): string {
		return esc_attr( __( $value, $domain ) );
	}

	/** Test JSON encoding. */
	function wp_json_encode( mixed $value ): string|false {
		return \json_encode( $value );
	}

	/** Test core script tag. */
	function wp_get_inline_script_tag( string $code ): string {
		return '<script>' . $code . '</script>';
	}

