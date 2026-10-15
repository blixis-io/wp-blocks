<?php
/**
 * Builder theme contract.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Theme;

\defined( 'ABSPATH' ) || exit;
/** Pure header rules and request-scoped compatibility results by active context. */
final class ThemeCompat {
	public const SUPPORTED_MIN = 1;
	public const SUPPORTED_MAX = 1;
	private const CACHE_LIMIT  = 8;
	/** Cached only for the current PHP request, by blog and theme identity.
	 *
	 * @var array<string, ThemeStatus>
	 */
	private static array $cached = [];
	/** Create the service.
	 *
	 * @param CompatibilityReader $reader Source adapter.
	 */
	public function __construct( private CompatibilityReader $reader ) {}
	/** Parse the theme's header grammar without calling theme code.
	 *
	 * @param string|false|null $value Raw value.
	 */
	public static function parse( string|false|null $value ): ?int {
		if ( ! \is_string( $value ) || 1 !== \preg_match( '/^[1-9][0-9]{0,3}$/D', \trim( $value ) ) ) {
			return null;
		}
		return (int) \trim( $value );
	}
	/** Resolve a child's header before parsing; any explicit child header overrides its parent.
	 *
	 * @param string $own Active stylesheet header.
	 * @param bool   $own_present Whether the child explicitly declared the header.
	 * @param string $parent_header Parent stylesheet header.
	 * @return string Effective raw declaration.
	 */
	public static function effective_header( string $own, bool $own_present, string $parent_header ): string {
		return $own_present ? $own : $parent_header;
	}
	/** Determine whether a bounded style.css header declares the marker, including an empty value.
	 *
	 * @param string $head First 8192 bytes of style.css.
	 * @return bool
	 */
	public static function header_present( string $head ): bool {
		return 1 === \preg_match( '/^[ \t\/*#@]*Blixis-Compat[ \t]*:/mi', $head );
	}
	/** Reset the per-request cache for isolated tests. */
	public static function reset_for_tests(): void {
		self::$cached = [];
	}
	/** Evaluate the effective active theme declaration; read errors fail closed. */
	public function status(): ThemeStatus {
		$key = null;
		try {
			$key = $this->reader->context_key();
			if ( isset( self::$cached[ $key ] ) ) {
				return self::$cached[ $key ];
			}
			$theme    = $this->reader->active_theme_name();
			$declared = $this->reader->declared();
			$invalid  = null === $declared && $this->reader->invalid_declaration();
		} catch ( \Throwable $exception ) {
			$theme    = '';
			$declared = null;
			$invalid  = false;
		}
		$reason = null === $declared ? ( $invalid ? 'invalid-declaration' : 'not-declared' ) : ( $declared < self::SUPPORTED_MIN ? 'too-old' : ( $declared > self::SUPPORTED_MAX ? 'too-new' : 'ok' ) );
		$status = new ThemeStatus( 'ok' === $reason, $declared, self::SUPPORTED_MIN, self::SUPPORTED_MAX, $theme, $reason );
		if ( null !== $key ) {
			if ( self::CACHE_LIMIT <= \count( self::$cached ) ) {
				unset( self::$cached[ \array_key_first( self::$cached ) ] );
			}
			self::$cached[ $key ] = $status;
		}
		return $status;
	}
}
