<?php
/**
 * WordPress theme header adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Theme;

\defined( 'ABSPATH' ) || exit;
/** Reads style.css through core's size-limited header reader. */
final class WordPressCompatibilityReader implements CompatibilityReader {
	/** Implement the compatibility reader contract. */
	public function context_key(): string {
		return \get_current_blog_id() . '|' . \get_stylesheet() . '|' . \get_template();
	}
	/** Effective raw header and whether it was explicitly present.
	 *
	 * @return array{value: string, present: bool}
	 */
	private function header(): array {
		$own = $this->from_directory( \get_stylesheet_directory() );
		if ( $own['present'] ) {
			return $own;
		}
		$parent          = $this->from_directory( \get_template_directory() );
		$parent['value'] = ThemeCompat::effective_header( $own['value'], false, $parent['value'] );
		return $parent;
	}
	/** Read a theme header.
	 *
	 * @param string $directory Theme directory.
	 * @return array{value: string, present: bool}
	 */
	private function from_directory( string $directory ): array {
		$file = \rtrim( $directory, '/\\' ) . '/style.css';
		$data = \get_file_data( $file, [ 'compat' => 'Blixis-Compat' ] );
		// get_file_data returns the same empty string for a missing and an empty header.
		$head    = \file_get_contents( $file, false, null, 0, 8192 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bounded local header probe; core reads the value above.
		$present = \is_string( $head ) && ThemeCompat::header_present( $head );
		return [
			'value'   => \is_string( $data['compat'] ?? null ) ? $data['compat'] : '',
			'present' => $present,
		];
	}
	/** Implement the compatibility reader contract. */
	public function declared(): ?int {
		return ThemeCompat::parse( $this->header()['value'] );
	}
	/** Implement the compatibility reader contract. */
	public function invalid_declaration(): bool {
		$header = $this->header();
		return $header['present'] && null === ThemeCompat::parse( $header['value'] );
	}
	/** Implement the compatibility reader contract. */
	public function active_theme_name(): string {
		return (string) \wp_get_theme()->get( 'Name' );
	}
}
