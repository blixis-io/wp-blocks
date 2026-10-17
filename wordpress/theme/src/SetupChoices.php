<?php
/**
 * Validated bundled setup palette and font choices.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/** Loads curated choices from theme data and validates them against the setup contract. */
final class SetupChoices {
	/** Return palette choices after schema and contrast validation.
	 *
	 * @param string $theme_directory Optional theme root for tests.
	 * @return list<array{id: string, label: string, descriptor: string, preset: string, tokens: array<string, mixed>}>
	 */
	public static function schemes( string $theme_directory = '' ): array {
		$data = self::data( 'color-schemes.json', 'schemes', $theme_directory );
		if ( null === $data ) {
			return [];
		}
		$result = [];
		$seen   = [];
		foreach ( $data['schemes'] as $scheme ) {
			if ( ! is_array( $scheme ) || ! self::valid_copy( $scheme, [ 'id', 'label', 'descriptor', 'preset' ] ) || isset( $seen[ $scheme['id'] ] ) || ! in_array( $scheme['preset'], [ 'ocean', 'forest', 'sunset', 'minimal' ], true ) ) {
				return [];
			}
			$path   = ( '' === $theme_directory ? get_template_directory() : $theme_directory ) . '/design/presets/' . $scheme['preset'] . '.json';
			$tokens = TokenDraft::seed( $path, $scheme['preset'] );
			if ( null === $tokens || TokenDraft::validate( $tokens, $tokens ) ) {
				return [];
			}
			$seen[ $scheme['id'] ] = true;
			$result[]              = [
				'id'         => $scheme['id'],
				'label'      => $scheme['label'],
				'descriptor' => $scheme['descriptor'],
				'preset'     => $scheme['preset'],
				'tokens'     => $tokens,
			];
		}
		return $result;
	}

	/** Return validated font pairings.
	 *
	 * @param array<string>|null $installed_stacks Server-derived installed fonts, or null to query WordPress.
	 * @param string             $theme_directory Optional theme root for tests.
	 * @return list<array{id: string, label: string, descriptor: string, body: string, heading: string}>
	 */
	public static function fonts( ?array $installed_stacks = null, string $theme_directory = '' ): array {
		$data = self::data( 'font-pairings.json', 'pairings', $theme_directory );
		if ( null === $data ) {
			return [];
		}
		$result         = [];
		$seen           = [];
		$allowed_stacks = null === $installed_stacks ? FontLibrary::allowed_stacks() : $installed_stacks;
		$theme_root     = '' === $theme_directory ? get_template_directory() : $theme_directory;
		$font_seed      = TokenDraft::seed( $theme_root . '/design/default-tokens.json', 'custom' );
		if ( null === $font_seed ) {
			return [];
		}
		foreach ( $data['pairings'] as $font ) {
			if ( ! is_array( $font ) || array_diff( array_keys( $font ), [ 'id', 'label', 'descriptor', 'body', 'heading' ] ) || array_diff( [ 'id', 'label', 'descriptor', 'body', 'heading' ], array_keys( $font ) ) || ! self::valid_copy(
				[
					'id'         => $font['id'],
					'label'      => $font['label'],
					'descriptor' => $font['descriptor'],
				],
				[ 'id', 'label', 'descriptor' ]
			) || isset( $seen[ $font['id'] ] ) ) {
				return [];
			}
			foreach ( [ 'body', 'heading' ] as $token ) {
				if ( ! in_array( $font[ $token ], TokenDraft::options( 'font-' . $token, $font_seed[ 'font-' . $token ]['value'], $allowed_stacks ), true ) ) {
					return [];
				}
			}
			$seen[ $font['id'] ] = true;
			$result[]            = [
				'id'         => $font['id'],
				'label'      => $font['label'],
				'descriptor' => $font['descriptor'],
				'body'       => $font['body'],
				'heading'    => $font['heading'],
			];
		}
		return $result;
	}

	/** Apply validated palette and font choices to a preset seed.
	 *
	 * @param array<string, mixed> $tokens Preset token seed.
	 * @param string               $scheme_id Palette id.
	 * @param string               $font_id Font pairing id.
	 * @param array<string>|null   $installed_stacks Server-derived font stacks, or null to query WordPress.
	 * @param string               $theme_directory Optional theme root for tests.
	 * @return array<string, mixed>|null Updated tokens, or null when a choice fails validation.
	 */
	public static function apply_to_tokens( array $tokens, string $scheme_id, string $font_id, ?array $installed_stacks = null, string $theme_directory = '' ): ?array {
		$scheme = null;
		foreach ( self::schemes( $theme_directory ) as $choice ) {
			if ( $choice['id'] === $scheme_id ) {
				$scheme = $choice;
				break;
			}
		}
		$font = null;
		foreach ( self::fonts( $installed_stacks, $theme_directory ) as $choice ) {
			if ( $choice['id'] === $font_id ) {
				$font = $choice;
				break;
			}
		}
		if ( null === $scheme || null === $font ) {
			return null;
		}
		$updated = $tokens;
		foreach ( $updated as $name => &$entry ) {
			if ( is_string( $name ) && str_starts_with( $name, 'color-' ) ) {
				$entry = $scheme['tokens'][ $name ];
			}
		}
		unset( $entry );
		$updated['font-body']['value']    = $font['body'];
		$updated['font-heading']['value'] = $font['heading'];
		$allowed_stacks                   = null === $installed_stacks ? FontLibrary::allowed_stacks() : $installed_stacks;
		return TokenDraft::validate( $updated, $tokens, $allowed_stacks ) ? null : $updated;
	}

	/** Validate exact schema fields and bounded plain-text copy.
	 *
	 * @param array<string, mixed> $record Data record.
	 * @param array<string>        $keys Required keys.
	 */
	private static function valid_copy( array $record, array $keys ): bool {
		if ( array_diff( array_keys( $record ), $keys ) || array_diff( $keys, array_keys( $record ) ) ) {
			return false;
		}
		foreach ( $keys as $key ) {
			if ( ! is_string( $record[ $key ] ) || '' === trim( $record[ $key ] ) || strlen( $record[ $key ] ) > 100 || 1 !== preg_match( '/^[\p{L}\p{N} .,&\x27-]+$/uD', $record[ $key ] ) ) {
				return false;
			}
		}
		return true;
	}

	/** Read a versioned data file from the active theme.
	 *
	 * @param string $file Data file name.
	 * @param string $key List property name.
	 * @param string $theme_directory Optional theme root for tests.
	 * @return array<string, mixed>|null
	 */
	private static function data( string $file, string $key, string $theme_directory = '' ): ?array {
		$path = ( '' === $theme_directory ? get_template_directory() : $theme_directory ) . '/design/' . $file;
		if ( ! is_readable( $path ) ) {
			return null;
		}
		$data = json_decode( (string) file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled theme data.
		return is_array( $data ) && 1 === ( $data['schemaVersion'] ?? null ) && is_array( $data[ $key ] ?? null ) ? $data : null;
	}
}
