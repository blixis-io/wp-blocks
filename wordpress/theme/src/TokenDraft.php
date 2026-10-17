<?php
/**
 * Bounded, pure validation for setup token drafts.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * Validates the small editable subset of theme tokens without WordPress.
 */
final class TokenDraft {
	public const MAX_BYTES = 8192;
	private const PAIRS    = [
		[ 'color-text', 'color-bg', 4.5 ],
		[ 'color-link', 'color-bg', 4.5 ],
		[ 'color-on-primary', 'color-primary', 4.5 ],
		[ 'color-line', 'color-bg', 3.0 ],
	];

	/**
	 * Load and validate a bundled seed. Returns null for corrupt source data.
	 *
	 * @param string $path Absolute JSON file path.
	 * @param string $preset Expected preset ID, or custom for defaults.
	 * @return array<string, mixed>|null
	 */
	public static function seed( string $path, string $preset ): ?array {
		if ( ! \is_file( $path ) || ! \is_readable( $path ) ) {
			return null;
		}
		$raw = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local bundled JSON.
		if ( false === $raw || \strlen( $raw ) > 16384 ) {
			return null;
		}
		$data = json_decode( $raw, true );
		if ( ! \is_array( $data ) || 1 !== ( $data['schemaVersion'] ?? null ) || ! \is_array( $data['tokens'] ?? null ) ) {
			return null;
		}
		if ( 'custom' !== $preset && ( $data['id'] ?? null ) !== $preset ) {
			return null;
		}
		if ( 'custom' !== $preset && ( ! \is_string( $data['category'] ?? null ) || ! \in_array( $data['category'], [ 'business', 'blog', 'portfolio', 'ecommerce' ], true ) ) ) {
			return null;
		}
		$tokens        = [];
		$allowed_names = [ 'color-bg', 'color-surface', 'color-text', 'color-muted', 'color-link', 'color-primary', 'color-on-primary', 'color-line', 'font-body', 'font-heading', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'space-1', 'space-2', 'space-3', 'space-4', 'space-6', 'space-8', 'radius-sm', 'radius-md', 'container-content', 'container-wide', 'shadow-card' ];
		foreach ( $data['tokens'] as $token ) {
			if ( ! \is_array( $token ) || ! \is_string( $token['name'] ?? null ) || ! \is_string( $token['category'] ?? null ) || ! \is_string( $token['value'] ?? null ) ) {
				return null;
			}
			$name     = $token['name'];
			$category = str_starts_with( $name, 'color-' ) ? 'color' : ( str_starts_with( $name, 'font-' ) ? 'font-family' : ( str_starts_with( $name, 'text-' ) ? 'font-size' : ( str_starts_with( $name, 'space-' ) ? 'spacing' : ( str_starts_with( $name, 'radius-' ) ? 'radius' : ( str_starts_with( $name, 'container-' ) ? 'container' : 'shadow' ) ) ) ) );
			if ( ! \in_array( $name, $allowed_names, true ) || isset( $tokens[ $name ] ) || $token['category'] !== $category || ( 'color' === $category && ! \is_string( $token['dark'] ?? null ) ) ) {
				return null;
			}
			$tokens[ $name ] = [ 'value' => $token['value'] ];
			if ( isset( $token['dark'] ) ) {
				$tokens[ $token['name'] ]['dark'] = $token['dark'];
			}
		}
		if ( \count( $tokens ) !== 26 ) {
			return null;
		}
		$result = self::validate( $tokens, $tokens );
		return [] === $result ? $tokens : null;
	}

	/**
	 * Validate a complete token map against names and categories in the seed.
	 *
	 * @param mixed                $input Submitted map.
	 * @param array<string, mixed> $seed  Bundled reference map.
	 * @param array<string>        $extra_fonts Server-derived installed font stacks.
	 * @return array<string, string> Field ID => error message.
	 */
	public static function validate( mixed $input, array $seed, array $extra_fonts = [] ): array {
		if ( ! \is_array( $input ) || \count( $input ) !== \count( $seed ) || \array_diff( \array_keys( $input ), \array_keys( $seed ) ) || \array_diff( \array_keys( $seed ), \array_keys( $input ) ) ) {
			return [ 'tokens' => 'Token names do not match the bundled design.' ];
		}
		$encoded = json_encode( $input ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure validator used without WordPress.
		if ( false === $encoded || \strlen( $encoded ) > self::MAX_BYTES ) {
			return [ 'tokens' => 'The draft is too large.' ];
		}
		$errors = [];
		foreach ( $seed as $name => $reference ) {
			$entry    = $input[ $name ];
			$is_color = str_starts_with( $name, 'color-' );
			$expected = $is_color ? [ 'value', 'dark' ] : [ 'value' ];
			if ( ! \is_array( $entry ) || \array_keys( $entry ) !== $expected ) {
				$errors[ $name ] = 'This token has an invalid shape.';
				continue;
			}
			foreach ( $expected as $mode ) {
				$value = $entry[ $mode ];
				$field = $name . ( 'dark' === $mode ? '-dark' : '-value' );
				if ( ! \is_string( $value ) || \strlen( $value ) > 100 ) {
					$errors[ $field ] = 'Enter an allowed value.';
				} elseif ( $is_color ) {
					if ( 1 !== \preg_match( '/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/D', $value ) ) {
						$errors[ $field ] = 'Enter a hex color such as #123 or #112233.';
					}
				} elseif ( ! \in_array( $value, self::options( $name, $reference['value'], $extra_fonts ), true ) ) {
					$errors[ $field ] = 'Choose an allowed value.';
				}
			}
		}
		return $errors + self::contrast_errors( $input );
	}

	/**
	 * Allowed controlled values for a non-color token.
	 *
	 * @param string        $name Token name.
	 * @param string        $bundled_value Bundled value.
	 * @param array<string> $extra_fonts Server-derived installed font stacks.
	 * @return list<string>
	 */
	public static function options( string $name, string $bundled_value, array $extra_fonts = [] ): array {
		if ( str_starts_with( $name, 'font-' ) ) {
			return \array_values( \array_unique( \array_merge( [ $bundled_value, 'Georgia, "Times New Roman", serif', 'ui-monospace, SFMono-Regular, monospace' ], $extra_fonts ) ) );
		}
		if ( 'text-base' === $name ) {
			return [ '0.875rem', '1rem', '1.125rem', '1.25rem' ];
		}
		if ( str_starts_with( $name, 'space-' ) ) {
			return array_values( array_unique( [ $bundled_value, '0', '0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem' ] ) );
		}
		if ( str_starts_with( $name, 'radius-' ) ) {
			return array_values( array_unique( [ $bundled_value, '0', '0.25rem', '0.5rem', '1rem' ] ) );
		}
		if ( str_starts_with( $name, 'container-' ) ) {
			return array_values( array_unique( [ $bundled_value, '40rem', '45rem', '60rem', '72rem', '80rem' ] ) );
		}
		return [ $bundled_value ];
	}

	/**
	 * WCAG 2.x ratio for opaque sRGB hex colors.
	 *
	 * @param string $foreground Foreground color.
	 * @param string $background Background color.
	 * @return float|null Ratio or null for unsupported values.
	 */
	public static function contrast_ratio( string $foreground, string $background ): ?float {
		$a = self::luminance( $foreground );
		$b = self::luminance( $background );
		return null === $a || null === $b ? null : ( max( $a, $b ) + 0.05 ) / ( min( $a, $b ) + 0.05 );
	}

	/**
	 * Compute relative luminance.
	 *
	 * @param string $color Color.
	 * @return float|null Luminance.
	 */
	private static function luminance( string $color ): ?float {
		if ( 1 !== \preg_match( '/^#([0-9a-f]{3}|[0-9a-f]{6})$/iD', $color, $match ) ) {
			return null;
		}
		$digits = $match[1];
		$sum    = 0.0;
		foreach ( [ 0.2126, 0.7152, 0.0722 ] as $index => $weight ) {
			$part  = 3 === \strlen( $digits ) ? str_repeat( $digits[ $index ], 2 ) : substr( $digits, $index * 2, 2 );
			$value = hexdec( $part ) / 255;
			$sum  += $weight * ( $value <= 0.04045 ? $value / 12.92 : ( ( $value + 0.055 ) / 1.055 ) ** 2.4 );
		}
		return $sum;
	}

	/**
	 * Report pair-specific contrast failures.
	 *
	 * @param array<string, mixed> $tokens Token map.
	 * @return array<string, string> Field errors.
	 */
	public static function contrast_errors( array $tokens ): array {
		$errors = [];
		foreach ( [
			'value' => 'light',
			'dark'  => 'dark',
		] as $key => $mode ) {
			foreach ( self::PAIRS as $pair ) {
				list( $foreground, $background, $minimum ) = $pair;
				$fg                                        = $tokens[ $foreground ][ $key ] ?? null;
				$bg                                        = $tokens[ $background ][ $key ] ?? null;
				if ( ! \is_string( $fg ) || ! \is_string( $bg ) ) {
					continue;
				}
				$actual = self::contrast_ratio( $fg, $bg );
				if ( null !== $actual && $actual < $minimum ) {
					$errors[ $foreground . '-' . $key ] = \sprintf( '%s against %s in %s mode needs %.1f:1 contrast (currently %.2f:1).', $foreground, $background, $mode, $minimum, $actual );
				}
			}
		}
		return $errors;
	}
}
