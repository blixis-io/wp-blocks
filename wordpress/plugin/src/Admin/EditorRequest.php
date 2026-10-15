<?php
/**
 * Editor request parsing.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Storage\MetaKeys;

\defined( 'ABSPATH' ) || exit;

/** Validated post identity and content locale, without WordPress request state. */
final class EditorRequest {
	/**
	 * Create a parsed request.
	 *
	 * @param int    $post_id Positive post ID or zero when invalid.
	 * @param string $content_locale Enabled locale after fallback.
	 */
	public function __construct( public readonly int $post_id, public readonly string $content_locale ) {}

	/**
	 * Parse query arguments; malformed locale always falls back to the configured default.
	 *
	 * @param array<string, mixed> $query Query arguments.
	 * @param LocaleConfig         $locales Enabled locale configuration.
	 * @return self
	 */
	public static function parse( array $query, LocaleConfig $locales ): self {
		$post_id = self::positive_id( $query['post'] ?? null );
		$locale  = $query['locale'] ?? null;
		if ( ! \is_string( $locale ) || ! MetaKeys::is_valid_locale( $locale ) || ! \in_array( $locale, $locales->enabled, true ) ) {
			$locale = $locales->default_locale;
		}
		return new self( $post_id, $locale );
	}

	/**
	 * Parse a strictly positive decimal integer without overflow.
	 *
	 * @param mixed $value Candidate value.
	 * @return int
	 */
	private static function positive_id( mixed $value ): int {
		if ( \is_int( $value ) ) {
			return $value > 0 ? $value : 0;
		}
		if ( ! \is_string( $value ) || 1 !== \preg_match( '/^[1-9][0-9]*$/D', $value ) ) {
			return 0;
		}
		$maximum = (string) PHP_INT_MAX;
		if ( \strlen( $value ) > \strlen( $maximum ) || ( \strlen( $value ) === \strlen( $maximum ) && \strcmp( $value, $maximum ) > 0 ) ) {
			return 0;
		}
		return (int) $value;
	}
}
