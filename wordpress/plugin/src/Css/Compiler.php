<?php
/**
 * Deterministic PHP twin of the TypeScript CSS compiler.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

\defined( 'ABSPATH' ) || exit;

/** Compiles validated document shapes without WordPress dependencies. */
final class Compiler {
	public const COMPILER_VERSION = 1;
	private const STATES          = [ 's0', 'hover', 'focus', 'focus-visible', 'active' ];
	private const KINDS           = [ 'base', 'bp', 'mode', 'modebp' ];
	private const ORIGINS         = [ 'class', 'el' ];
	private const AUTO_SCOPE      = ':where(html:not([data-theme="light"]):not([data-theme="dark"]))';
	private const AUTO_QUERY      = [
		'light' => 'not all and (prefers-color-scheme:dark)',
		'dark'  => '(prefers-color-scheme:dark)',
	];

	/**
	 * Both associative JSON arrays and stdClass trees are accepted. Objects are recursively converted to arrays;
	 * JSON lists retain their order. Callers provide structurally valid documents, as in TypeScript.
	 * The optional hash callback mirrors TypeScript's test hook.
	 *
	 * @param array<string, mixed>|\stdClass        $document Document.
	 * @param list<array<string, mixed>|\stdClass>  $classes Classes in precedence order.
	 * @param list<array<string, mixed>|\stdClass>  $tokens Token values.
	 * @param ?list<array<string, mixed>|\stdClass> $breakpoints Registry.
	 * @param ?callable(string): string             $hash Test hash replacement.
	 */
	public static function compile( array|\stdClass $document, array $classes = [], array $tokens = [], ?array $breakpoints = null, ?callable $hash = null ): CompileResult {
		$doc         = self::as_array( $document );
		$breakpoints = self::registry( $breakpoints );
		$issues      = [];
		$names       = [];
		$invalid     = Breakpoints::validate( $breakpoints );
		if ( null !== $invalid ) {
			return new CompileResult( '', [], [ self::issue( 'invalid-breakpoints', 'breakpoints', $invalid ) ] );
		}
		$rank = [];
		foreach ( $breakpoints as $index => $bp ) {
			$rank[ $bp['id'] ] = $index;
		}
		$groups = [];
		$info   = [];
		$owners = [];
		if ( count( $classes ) > 1000 ) {
			$issues[] = self::issue( 'too-many-classes', 'classes', 'more than 1000 classes; the rest are ignored' );
		}
		foreach ( array_slice( $classes, 0, 1000 ) as $index => $raw ) {
			$cls = self::as_array( $raw );
			$id  = $cls['id'];
			if ( isset( $info[ $id ] ) ) {
				$issues[] = self::issue( 'duplicate-class', "classes[$index]", "the class $id is defined twice; the first definition is used" );
				continue;
			}
			$digest = self::digest( $id, $hash );
			if ( null === $digest ) {
				$issues[] = self::issue( 'invalid-identifier', "classes[$index].id", 'class ids must be ASCII' );
				continue;
			}
			$name = 'blx-c-' . $digest;
			if ( isset( $owners[ $name ] ) ) {
				$issues[] = self::issue( 'hash-collision', "classes[$index]", "the class name $name is already used by {$owners[$name]}; this class is ignored" );
				continue;
			}
			$owners[ $name ] = $id;
			$info[ $id ]     = [
				'name'  => $name,
				'order' => $index + 1,
				'rules' => self::usable( $cls['rules'], "classes[$index]", 'rules', $rank, $issues ),
			];
		}
		$used  = [];
		$owned = [];
		$stack = [];
		foreach ( array_reverse( $doc['root'], true ) as $index => $node ) {
			$stack[] = [ self::as_array( $node ), '$.root[' . $index . ']' ];
		}
		while ( [] !== $stack ) {
			[ $node, $path ] = array_pop( $stack );
			$attached        = [];
			$style_rules     = \array_values( \array_merge( \is_array( $node['style'] ?? null ) ? $node['style'] : [], self::template_layout_rules( $node, $path, $issues ) ) );
			$own             = self::usable( $style_rules, $path, 'style', $rank, $issues );
			$digest          = [] !== $own ? ( \is_string( $doc['documentId'] ?? null ) ? self::digest( $doc['documentId'] . ':' . $node['id'], $hash ) : null ) : '';
			if ( null === $digest ) {
				$issues[] = self::issue( 'invalid-identifier', $path, 'document and element ids must be ASCII' );
			} elseif ( [] !== $own ) {
				$name = 'blx-' . $digest;
				if ( isset( $owned[ $name ] ) && $owned[ $name ] !== $node['id'] ) {
					$issues[] = self::issue( 'hash-collision', $path, "the class name $name is already used by {$owned[$name]}; this element is not styled" );
				} else {
					$owned[ $name ] = $node['id'];
					$attached[]     = $name;
					foreach ( $own as $item ) {
						self::add( $groups, 'el', $name, 0, $item, $breakpoints, $rank );
					}
				}
			}
			$referenced = [];
			foreach ( $node['classIds'] ?? [] as $index => $id ) {
				if ( isset( $referenced[ $id ] ) ) {
					$issues[] = self::issue( 'duplicate-class-reference', $path . '.classIds[' . $index . ']', "the class $id is listed twice" );
					continue;
				}
				$referenced[ $id ] = true;
				if ( ! isset( $info[ $id ] ) ) {
					$issues[] = self::issue( 'unknown-class', $path . '.classIds[' . $index . ']', "the class $id is not defined" );
					continue;
				}
				$class = $info[ $id ];
				if ( ! in_array( $class['name'], $attached, true ) ) {
					$attached[] = $class['name'];
				}
				if ( ! isset( $used[ $id ] ) ) {
					$used[ $id ] = true;
					foreach ( $class['rules'] as $item ) {
						self::add( $groups, 'class', $class['name'], $class['order'], $item, $breakpoints, $rank );
					}
				}
			}
			if ( [] !== $attached ) {
				$names[ $node['id'] ] = $attached;
			}
			foreach ( array_reverse( $node['children'], true ) as $index => $child ) {
				$stack[] = [ self::as_array( $child ), $path . '.children[' . $index . ']' ];
			}
		}
		$ordered = array_values( $groups );
		\usort( $ordered, static fn ( array $a, array $b ): int => self::chain( $a['layer'] <=> $b['layer'], $a['bp'] <=> $b['bp'], $a['order'] <=> $b['order'], \strcmp( $a['mode'] ?? '', $b['mode'] ?? '' ), \strcmp( $a['decls'], $b['decls'] ) ) );
		$blocks = [];
		foreach ( $ordered as $group ) {
			$selector_names = array_map( 'strval', array_keys( $group['names'] ) );
			\usort( $selector_names, static fn ( string $a, string $b ): int => \strcmp( $a, $b ) );
			$plain = self::selectors( $selector_names, '', $group['state'] );
			$body  = '{' . $group['decls'] . '}';
			$mode  = $group['mode'];
			$width = $group['width'];
			if ( null === $mode ) {
				$css = self::wrap( $plain . $body, $width );
			} else {
				$explicit = self::selectors( $selector_names, ':where(html[data-theme="' . $mode . '"])', $group['state'] );
				$auto     = self::selectors( $selector_names, self::AUTO_SCOPE, $group['state'] );
				$css      = self::wrap( $explicit . $body, $width ) . '@media ' . self::AUTO_QUERY[ $mode ] . '{' . self::wrap( $auto . $body, $width ) . '}';
			}
			$blocks[ $group['layer'] ][] = $css;
		}
		$token_css = self::tokens( $tokens, $issues );
		if ( '' !== $token_css ) {
			$blocks[1] = [ $token_css ];
		}
		$mark_css = self::marks( $tokens );
		if ( '' !== $mark_css ) {
			$blocks[2] = [ $mark_css ];
		}
		$layers = [ 'blx.theme', 'blx.tokens', 'blx.marks' ];
		foreach ( self::ORIGINS as $origin ) {
			foreach ( self::STATES as $state ) {
				foreach ( self::KINDS as $kind ) {
					$layers[] = "blx.$origin.$state.$kind";
				}
			}
		}
		$parts = [ '/*blx-css:1*/', '@layer ' . implode( ',', $layers ) . ';' ];
		\ksort( $blocks, SORT_NUMERIC );
		foreach ( $blocks as $index => $rules ) {
			$parts[] = '@layer ' . $layers[ $index ] . '{' . implode( '', $rules ) . '}';
		}
		return new CompileResult( implode( "\n", $parts ) . "\n", $names, $issues );
	}

	/**
	 * The breakpoint registry as a typed list (its shape is checked by Breakpoints::validate()).
	 *
	 * @param ?list<array<string, mixed>|\stdClass> $breakpoints Registry or null for the default.
	 * @return list<array{id: string, maxWidth: ?int}>
	 */
	private static function registry( ?array $breakpoints ): array {
		if ( null === $breakpoints ) {
			return Breakpoints::DEFAULT_REGISTRY;
		}
		$out = [];
		foreach ( $breakpoints as $entry ) {
			$bp    = self::as_array( $entry );
			$out[] = [
				'id'       => \is_string( $bp['id'] ?? null ) ? $bp['id'] : '',
				'maxWidth' => \is_int( $bp['maxWidth'] ?? null ) ? $bp['maxWidth'] : null,
			];
		}
		return $out;
	}

	/**
	 * First non-zero comparison result (a total order from chained comparators).
	 *
	 * @param int ...$results Comparison results in priority order.
	 * @return int
	 */
	private static function chain( int ...$results ): int {
		foreach ( $results as $result ) {
			if ( 0 !== $result ) {
				return $result;
			}
		}
		return 0;
	}

	/**
	 * Cast a decoded JSON object or array to an array.
	 *
	 * @param array<mixed>|\stdClass $value Decoded value.
	 * @return array<string, mixed>
	 */
	private static function as_array( array|\stdClass $value ): array {
		return (array) $value;
	}

	/**
	 * Twelve hex characters of SHA-256, or null for non-ASCII input.
	 *
	 * @param string                          $text Text to hash.
	 * @param (callable(string): string)|null $hash Hash override (tests only).
	 * @return ?string
	 */
	private static function digest( string $text, ?callable $hash ): ?string {
		try {
			if ( null === $hash && 1 === \preg_match( '/[^\x00-\x7f]/', $text ) ) {
				return null;
			}
			return null === $hash ? substr( \hash( 'sha256', $text ), 0, 12 ) : $hash( $text );
		} catch ( \Throwable $error ) {
			return null;
		}
	}

	/**
	 * Build one diagnostic.
	 *
	 * @param string $code Issue code.
	 * @param string $path Document path.
	 * @param string $message Message.
	 * @return array{code: string, path: string, message: string}
	 */
	private static function issue( string $code, string $path, string $message ): array {
		return [
			'code'    => $code,
			'path'    => $path,
			'message' => $message,
		];
	}

	/**
	 * Validate the rules of one owner and keep the usable ones.
	 *
	 * @param list<array<string, mixed>|\stdClass>                     $rules Owner rules.
	 * @param string                                                   $path Owner path.
	 * @param string                                                   $field Rules field name.
	 * @param array<string, int>                                       $rank Breakpoint ranks.
	 * @param list<array{code: string, path: string, message: string}> $issues Output issues.
	 * @return list<array{rule: array<string, mixed>, decls: string}>
	 */
	private static function usable( array $rules, string $path, string $field, array $rank, array &$issues ): array {
		$seen = [];
		$out  = [];
		if ( \count( $rules ) > 256 ) {
			$issues[] = self::issue( 'too-many-rules', $path, 'more than 256 rules; the rest are ignored' );
		}
		foreach ( \array_slice( $rules, 0, 256 ) as $index => $raw ) {
			$rule  = self::as_array( $raw );
			$where = $path . '.' . $field . '[' . $index . ']';
			if ( isset( $rule['breakpoint'] ) && ! isset( $rank[ $rule['breakpoint'] ] ) ) {
				$issues[] = self::issue( 'unknown-breakpoint', $where . '.breakpoint', '"' . $rule['breakpoint'] . '" is not a registered breakpoint (or is base)' );
				continue;
			}
			if ( 'base' === ( $rule['breakpoint'] ?? null ) ) {
				$issues[] = self::issue( 'unknown-breakpoint', $where . '.breakpoint', 'base is expressed by leaving the breakpoint out' );
				continue;
			}
			$clean = DeclarationValidator::sanitize( self::as_array( $rule['declarations'] ) );
			foreach ( $clean['issues'] as $problem ) {
				$issues[] = self::issue( 'invalid-declaration', $where . '.declarations.' . $problem['name'], $problem['code'] . ': ' . $problem['message'] );
			}
			$decls = self::declarations( $clean['declarations'] );
			if ( '' === $decls ) {
				continue;
			}
			$identity = ( $rule['state'] ?? '-' ) . '|' . ( $rule['mode'] ?? '-' ) . '|' . ( $rule['breakpoint'] ?? '-' );
			if ( isset( $seen[ $identity ] ) ) {
				$issues[] = self::issue( 'duplicate-rule', $where, 'two rules with the same state, mode and breakpoint; the first one is used' );
				continue;
			}
			$seen[ $identity ] = true;
			$out[]             = [
				'rule'  => $rule,
				'decls' => $decls,
			];
		}
		return $out;
	}

	/** Translate template layout props into normal validated CSS compiler rules.
	 *
	 * @param array<string,mixed>                                 $node Element data.
	 * @param string                                              $path JSON path.
	 * @param list<array{code:string,path:string,message:string}> $issues Issues.
	 * @return list<array<string,mixed>> Synthetic CSS rules.
	 */
	private static function template_layout_rules( array $node, string $path, array &$issues ): array {
		$props = \is_array( $node['props'] ?? null ) ? $node['props'] : [];
		$rules = [];
		$add   = static function ( ?string $breakpoint, array $declarations ) use ( &$rules ): void {
			if ( [] === $declarations ) {
				return;
			}
			foreach ( $rules as &$rule ) {
				if ( ( $rule['breakpoint'] ?? null ) === $breakpoint ) {
					$rule['declarations'] = \array_merge( $rule['declarations'], $declarations );
					return; }
			}
			unset( $rule );
			$rules[] = [
				'breakpoint'   => $breakpoint,
				'declarations' => $declarations,
			];
		};
		$type  = \is_string( $node['type'] ?? null ) ? \preg_replace( '~^blixis/~', '', $node['type'] ) : '';
		if ( \in_array( $type, [ 'grid', 'columns' ], true ) ) {
			$add( null, [ 'display' => 'grid' ] );
		} elseif ( 'stack' === $type ) {
			$add(
				null,
				[
					'display'        => 'flex',
					'flex-direction' => 'column',
				]
			);
		} elseif ( 'row' === $type ) {
			$add(
				null,
				[
					'display'        => 'flex',
					'flex-direction' => 'row',
				]
			);
		}
		$gap = $props['gapToken'] ?? null;
		if ( \is_string( $gap ) && 1 === \preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $gap ) ) {
			$add( null, [ 'gap' => 'var(--blx-' . $gap . ')' ] );
		} elseif ( null !== $gap ) {
			$issues[] = self::issue( 'invalid-layout-prop', $path . '.props.gapToken', 'gapToken must be a token identifier' );
		}
		$max_width = $props['maxWidthToken'] ?? null;
		if ( \is_string( $max_width ) && 1 === \preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $max_width ) ) {
			$add(
				null,
				[
					'width'        => '100%',
					'max-width'    => 'var(--blx-' . $max_width . ')',
					'margin-left'  => 'auto',
					'margin-right' => 'auto',
				]
			);
		} elseif ( null !== $max_width ) {
			$issues[] = self::issue( 'invalid-layout-prop', $path . '.props.maxWidthToken', 'maxWidthToken must be a token identifier' );
		}
		$fit = $props['fit'] ?? null;
		if ( \in_array( $type, [ 'image', 'site-logo' ], true ) && \is_string( $fit ) && \in_array( $fit, [ 'cover', 'contain' ], true ) ) {
			$add( null, [ 'object-fit' => $fit ] );
		}
		if ( 'site-header' === $type && true === ( $props['sticky'] ?? false ) ) {
			$add(
				null,
				[
					'position' => 'sticky',
					'top'      => '0',
				]
			);
		}
		$columns = $props['columns'] ?? null;
		if ( \is_array( $columns ) && ! \array_is_list( $columns ) ) {
			foreach ( [
				'desktop' => null,
				'tablet'  => 'tablet',
				'mobile'  => 'mobile',
			] as $key => $breakpoint ) {
				$count = $columns[ $key ] ?? null;
				if ( \is_int( $count ) && $count >= 1 && $count <= 12 ) {
					$add( $breakpoint, [ 'grid-template-columns' => 'repeat(' . $count . ', minmax(0, 1fr))' ] );
				} elseif ( null !== $count ) {
					$issues[] = self::issue( 'invalid-layout-prop', $path . '.props.columns.' . $key, 'column count must be an integer from 1 to 12' );
				}
			}
		} elseif ( null !== $columns ) {
			$issues[] = self::issue( 'invalid-layout-prop', $path . '.props.columns', 'columns must be a desktop/tablet/mobile object' );
		}
		$ratios = $props['ratios'] ?? null;
		if ( \is_array( $ratios ) && \array_is_list( $ratios ) && [] !== $ratios && \count( $ratios ) <= 12 ) {
			$parts = [];
			foreach ( $ratios as $ratio ) {
				if ( ( ! \is_int( $ratio ) && ! \is_float( $ratio ) ) || $ratio <= 0 || $ratio > 12 ) {
					$parts = [];
					break; }
				$parts[] = (string) $ratio . 'fr';
			}
			if ( [] !== $parts ) {
				$add( null, [ 'grid-template-columns' => \implode( ' ', $parts ) ] );
			} else {
				$issues[] = self::issue( 'invalid-layout-prop', $path . '.props.ratios', 'ratios must be positive numbers no greater than 12' );
			}
		}
		$stack_at = $props['stackAt'] ?? null;
		if ( \is_string( $stack_at ) && \in_array( $stack_at, [ 'tablet', 'mobile' ], true ) ) {
			$add( $stack_at, [ 'grid-template-columns' => '1fr' ] );
		} elseif ( null !== $stack_at ) {
			$issues[] = self::issue( 'invalid-layout-prop', $path . '.props.stackAt', 'stackAt must be tablet or mobile' );
		}
		return $rules;
	}

	/**
	 * Serialize sanitized declarations in overlap order.
	 *
	 * @param array<string, string> $declarations Validated declarations.
	 * @return string
	 */
	private static function declarations( array $declarations ): string {
		$keys = \array_keys( $declarations );
		// JS default comparison uses UTF-16 units. Generated property names are ASCII, so strcmp matches it.
		\usort( $keys, static fn ( string $a, string $b ): int => self::chain( self::overlap_rank( $a ) <=> self::overlap_rank( $b ), \strcmp( $a, $b ) ) );
		$parts = [];
		foreach ( $keys as $key ) {
			$parts[] = $key . ':' . $declarations[ $key ];
		}
		return \implode( ';', $parts );
	}

	/**
	 * Position of a property among the ones that overlap it (broader first).
	 *
	 * @param string $name Property name.
	 * @return int
	 */
	private static function overlap_rank( string $name ): int {
		if ( \str_starts_with( $name, '--' ) ) {
			return 0;
		}
		if ( 'border' === $name ) {
			return 10;
		}
		if ( \in_array( $name, [ 'border-width', 'border-style', 'border-color' ], true ) ) {
			return 20;
		}
		if ( 1 === \preg_match( '/^border-(?:top|right|bottom|left)$/D', $name ) ) {
			return 30;
		}
		if ( 1 === \preg_match( '/^border-(?:top|right|bottom|left)-(?:width|style|color)$/D', $name ) ) {
			return 40;
		}
		return \count( \explode( '-', $name ) ) * 100;
	}

	/**
	 * Add one usable rule to its deduplication group.
	 *
	 * @param array<string, mixed>                    $groups Groups.
	 * @param string                                  $origin class or el.
	 * @param string                                  $name Generated class name.
	 * @param int                                     $order Class order.
	 * @param array<string, mixed>                    $item Usable rule.
	 * @param list<array{id: string, maxWidth: ?int}> $breakpoints Registry.
	 * @param array<string, int>                      $rank Breakpoint ranks.
	 * @return void
	 */
	private static function add( array &$groups, string $origin, string $name, int $order, array $item, array $breakpoints, array $rank ): void {
		$rule  = $item['rule'];
		$bp_id = $rule['breakpoint'] ?? null;
		$bp    = null;
		foreach ( $breakpoints as $candidate ) {
			if ( $candidate['id'] === $bp_id ) {
				$bp = $candidate;
				break;
			}
		}
		$state_index = null === ( $rule['state'] ?? null ) ? 0 : \array_search( $rule['state'], self::STATES, true );
		$kind_index  = isset( $rule['mode'] ) ? ( null === $bp ? 2 : 3 ) : ( null === $bp ? 0 : 1 );
		$layer       = 3 + ( 'el' === $origin ? 20 : 0 ) + $state_index * 4 + $kind_index;
		$bp_rank     = null === $bp ? 0 : $rank[ $bp['id'] ];
		$key         = \implode( "\0", [ $layer, $bp_rank, $order, $rule['mode'] ?? '-', $item['decls'] ] );
		if ( ! isset( $groups[ $key ] ) ) {
			$groups[ $key ] = [
				'layer' => $layer,
				'bp'    => $bp_rank,
				'order' => $order,
				'mode'  => $rule['mode'] ?? null,
				'state' => $rule['state'] ?? null,
				'width' => $bp['maxWidth'] ?? null,
				'decls' => $item['decls'],
				'names' => [],
			];
		}
		$groups[ $key ]['names'][ $name ] = true;
	}

	/**
	 * Build a selector list.
	 *
	 * @param array<string> $names Selector names.
	 * @param string        $scope Appearance scope, or empty.
	 * @param ?string       $state State, or null.
	 * @return string
	 */
	private static function selectors( array $names, string $scope, ?string $state ): string {
		$out = [];
		foreach ( $names as $name ) {
			$out[] = ( '' === $scope ? '' : $scope . ' ' ) . '.' . $name . ( null === $state ? '' : ':where(:' . $state . ')' );
		}
		return \implode( ',', $out );
	}

	/**
	 * Wrap CSS in a max-width media query.
	 *
	 * @param string $css CSS.
	 * @param ?int   $width Max width in px, or null.
	 * @return string
	 */
	private static function wrap( string $css, ?int $width ): string {
		return null === $width ? $css : '@media (max-width:' . $width . 'px){' . $css . '}';
	}

	/**
	 * Compile the token layer.
	 *
	 * @param list<array<string, mixed>|\stdClass>                     $all Tokens.
	 * @param list<array{code: string, path: string, message: string}> $issues Issues.
	 * @return string
	 */
	private static function tokens( array $all, array &$issues ): string {
		if ( \count( $all ) > 1000 ) {
			$issues[] = self::issue( 'too-many-tokens', 'tokens', 'more than 1000 tokens; the rest are ignored' );
		}
		$values = [];
		$seen   = [];
		foreach ( \array_slice( $all, 0, 1000 ) as $index => $raw ) {
			$token  = self::as_array( $raw );
			$result = DeclarationValidator::validate( $token['name'], $token['value'] );
			$path   = "tokens[$index]";
			if ( ! $result->ok || ! \str_starts_with( $token['name'], '--' ) ) {
				$issues[] = self::issue( 'invalid-declaration', $path, $result->ok ? 'tokens must be --blx-* custom properties' : $result->code . ': ' . $result->message );
				continue;
			}
			$mode     = $token['mode'] ?? 'base';
			$identity = $mode . '|' . $token['name'];
			if ( isset( $seen[ $identity ] ) ) {
				$issues[] = self::issue( 'duplicate-token', $path, $token['name'] . " is set twice for $mode; the first value is used" );
				continue;
			}
			$seen[ $identity ]                 = true;
			$values[ $mode ][ $token['name'] ] = $result->value;
		}
		$css = '';
		if ( isset( $values['base'] ) ) {
			$css .= ':where(:root){' . self::declarations( $values['base'] ) . '}';
		}
		foreach ( [ 'light', 'dark' ] as $mode ) {
			if ( ! isset( $values[ $mode ] ) ) {
				continue;
			}
			$body = '{' . self::declarations( $values[ $mode ] ) . '}';
			$css .= ':where(html[data-theme="' . $mode . '"])' . $body . '@media ' . self::AUTO_QUERY[ $mode ] . '{' . self::AUTO_SCOPE . $body . '}';
		}
		return $css;
	}

	/** Fixed inline mark classes for color-category design tokens.
	 *
	 * @param list<array<string, mixed>|\stdClass> $all Token compiler values.
	 */
	private static function marks( array $all ): string {
		$ids = [];
		foreach ( \array_slice( $all, 0, 1000 ) as $raw ) {
			$token = self::as_array( $raw );
			if ( 'color' === ( $token['category'] ?? null ) && isset( $token['name'], $token['value'] ) && DeclarationValidator::validate( $token['name'], $token['value'] )->ok && 1 === \preg_match( '/^--blx-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/D', $token['name'], $match ) ) {
				$ids[ $match[1] ] = true;
			}
		}
		\ksort( $ids, SORT_STRING );
		$rules = [];
		foreach ( \array_keys( $ids ) as $id ) {
			$rules[] = '.blx-mc-' . $id . '{color:var(--blx-' . $id . ')}';
			$rules[] = '.blx-mh-' . $id . '{background-color:var(--blx-' . $id . ')}';
		}
		$rules[] = '.blx-mw-normal{font-weight:400}';
		$rules[] = '.blx-mw-medium{font-weight:500}';
		$rules[] = '.blx-mw-bold{font-weight:700}';
		return \implode( '', $rules );
	}
}
