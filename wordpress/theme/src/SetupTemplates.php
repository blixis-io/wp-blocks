<?php
/**
 * Optional server-side template provider and safe token mapper.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/** Theme-owned adapter for the optional Builder template catalogue. */
final class SetupTemplates {
	/** Read the public provider filter. Empty means use standalone preset cards.
	 *
	 * @return list<array<string, mixed>>
	 */
	public static function all(): array {
		$items = apply_filters( 'blixis_builder_setup_templates', [] );
		if ( ! is_array( $items ) ) {
			return [];
		}
		$valid = [];
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) || ! is_string( $item['id'] ?? null ) || 1 !== preg_match( '/^[a-z0-9-]{1,64}$/D', $item['id'] ) || ! is_string( $item['name'] ?? null ) || strlen( $item['name'] ) > 100 || ! is_string( $item['category'] ?? null ) || strlen( $item['category'] ) > 64 || ! is_string( $item['description'] ?? null ) || strlen( $item['description'] ) > 500 || ! is_string( $item['previewUrl'] ?? null ) || ! is_array( $item['designTokens'] ?? null ) ) {
				continue;
			}
			$valid[ $item['id'] ] = $item;
		}
		$items    = array_values( $valid );
		$priority = [ 'modern-homes', 'creative-agency', 'business', 'online-store' ];
		usort(
			$items,
			static function ( array $left, array $right ) use ( $priority ): int {
				$left_rank  = array_search( $left['id'], $priority, true );
				$right_rank = array_search( $right['id'], $priority, true );
				$left_rank  = false === $left_rank ? count( $priority ) : $left_rank;
				$right_rank = false === $right_rank ? count( $priority ) : $right_rank;
				$rank_order = $left_rank <=> $right_rank;
				return 0 === $rank_order ? strcasecmp( $left['name'], $right['name'] ) : $rank_order;
			}
		);
		return $items;
	}

	/** Resolve a template id from the current validated catalogue.
	 *
	 * @param string $id Template identifier.
	 * @return array<string, mixed>|null
	 */
	public static function find( string $id ): ?array {
		foreach ( self::all() as $template ) {
			if ( $template['id'] === $id ) {
				return $template;
			}
		}
		return null;
	}

	/** Build theme-owned card records when the Builder is inactive.
	 *
	 * @return list<array<string, mixed>>
	 */
	public static function fallback(): array {
		$templates = [];
		foreach ( [ 'ocean', 'forest', 'sunset', 'minimal' ] as $id ) {
			$path = get_template_directory() . '/design/presets/' . $id . '.json';
			$data = is_readable( $path ) ? json_decode( (string) file_get_contents( $path ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled preset.
			if ( ! is_array( $data ) ) {
				continue;
			}
			$templates[] = [
				'id'             => $id,
				'name'           => (string) ( $data['label'] ?? ucfirst( $id ) ),
				'category'       => (string) ( $data['category'] ?? 'business' ),
				'description'    => (string) ( $data['tagline'] ?? '' ),
				'previewUrl'     => '',
				'designTokens'   => [
					'colors' => [
						'light' => [],
						'dark'  => [],
					],
				],
				'fallbackPreset' => $id,
			];
		}
		return $templates;
	}

	/** Catalogue available to the wizard, including standalone preset cards.
	 *
	 * @return list<array<string, mixed>>
	 */
	public static function catalogue(): array {
		$templates = self::all();
		return [] !== $templates ? $templates : self::fallback();
	}

	/** Map only values accepted by the theme token schema; unknown design keys are ignored.
	 *
	 * @param array<string, mixed> $source Pack design tokens.
	 * @param array<string, mixed> $seed Theme seed.
	 * @return array<string, mixed>
	 */
	public static function tokens( array $source, array $seed ): array {
		$colors = $source['colors'] ?? [];
		if ( ! is_array( $colors ) || ! is_array( $colors['light'] ?? null ) || ! is_array( $colors['dark'] ?? null ) ) {
			return $seed;
		}
		$map = [
			'color-bg'      => 'background',
			'color-surface' => 'surface',
			'color-text'    => 'text',
			'color-muted'   => 'muted',
			'color-link'    => 'primary',
			'color-primary' => 'primary',
			'color-line'    => 'muted',
		];
		$out = $seed;
		foreach ( $map as $token => $key ) {
			$light = $colors['light'][ $key ] ?? null;
			$dark  = $colors['dark'][ $key ] ?? null;
			if ( is_string( $light ) && is_string( $dark ) && 1 === preg_match( '/^#[0-9a-fA-F]{6}$/D', $light ) && 1 === preg_match( '/^#[0-9a-fA-F]{6}$/D', $dark ) ) {
				$out[ $token ] = [
					'value' => $light,
					'dark'  => $dark,
				];
			}
		}
		// The pack has no on-primary semantic token. Choose whichever neutral foreground passes AA.
		foreach ( [
			'value' => 'light',
			'dark'  => 'dark',
		] as $mode => $palette ) {
			$primary = $colors[ $palette ]['primary'] ?? '';
			$black   = '#111827';
			$white   = '#ffffff';
			if ( is_string( $primary ) && TokenDraft::contrast_ratio( $white, $primary ) >= 4.5 ) {
				$out['color-on-primary'][ $mode ] = $white;
			} elseif ( is_string( $primary ) && TokenDraft::contrast_ratio( $black, $primary ) >= 4.5 ) {
				$out['color-on-primary'][ $mode ] = $black;
			}
		}
		return [] === TokenDraft::validate( $out, $seed ) ? $out : $seed;
	}
}
